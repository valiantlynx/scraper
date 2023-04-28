import puppeteer from "puppeteer"; // 'puppeteer' if not using browserless and 'puppeteer-core' if using browserless

const fetch = require("node-fetch");
const fs = require("fs");

async function run() {
    let browser;
    const pageNumber = 2549;



   // const endpoint = 'wss://chrome.browserless.io?token=7fc44ee7-19d6-4da4-9bde-5b445b58414c';

    // loop through the pages and get the manga list from each page starting from page pageNumber to the last page, the last page is unknown
    for (let i = pageNumber; i <= 2550; i++) {

        console.log("currently on page", i);

        // test url 
        //const url = `https://bot.sannysoft.com/`;
        const url = `https://mangapark.net/browse?page=${i}`;
        console.log("url", url);
        try {

            // browser = await puppeteer.connect({
            //     browserWSEndpoint: endpoint,
            // });

            // 'false' makes the browser visible and it does not look like a robot, 
            // 'true' makes the browser invisible and it looks like a robot
            // 'new' makes the browser invisible and it does not look like a robot,
            browser = await puppeteer.launch({ headless: false });

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(2 * 60 * 1000);

            // go to the url and get the manga list
            await page.goto(url);
            await page.screenshot({ path: "screenshot.png" });

            await page.waitForSelector("#subject-list");



            const mangas = Array.from(await page.$$(".pb-3"));
            const data = await Promise.all(
                mangas.map(async (manga: any) => {
                    const content = await manga.evaluate((e: any) => {
                        const titleElement = e.querySelector('.fw-bold')
                        const imgElement = e.querySelector('img')
                        const tagsElement = e.querySelector('.genres')
                        const chaptersElement = e.querySelector('.text-ellipsis-1')
                        const srcElement = e.querySelector('a')
                        const descriptionElement = e.querySelector('.limit-html')
                        const authorElement = e.querySelector('.autarts')

                        return {
                            title: titleElement ? titleElement.innerText : null,
                            img: imgElement ? imgElement.getAttribute('src') : null,
                            tags: tagsElement ? tagsElement.innerText : null,
                            latestChapter: chaptersElement ? chaptersElement.innerText : null,
                            src: srcElement ? srcElement.href : null,
                            description: descriptionElement ? descriptionElement.innerText : null,
                            author: authorElement ? [authorElement.innerText, authorElement.querySelector('a').href] : null, // [name, link] might use the link later to get more info
                        };
                    });

                    return content;
                })
            );

            console.log("data new", JSON.stringify(data[0], null, 2));

            let mangaData: any = {}

            const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));


            // go to each manga page and get the image
            for (const manga of data) {
                console.log("Navigating to: ", manga.src);
                await page.goto(manga.src);
                await delay(1000);

                const elements = Array.from(await page.$$(".episode-item"));
                const data = await Promise.all(
                    elements.map(async (chapterBody: any) => {
                        const content = await chapterBody.evaluate((e: any) => {
                            const srcElement = e.querySelector('a')

                            return {
                                src: srcElement ? srcElement.href : null,
                                chapterTitle: srcElement ? srcElement.innerText : null,
                            };
                        });
                        return content;
                    })
                );

                // // download the manga profile image
                // console.log("Downloading manga profile image...");
                // downloadManga(manga)

                // go to each chapter page and get the images
                for (const chapter of data) {
                    console.log("Navigating to: ", chapter.src);
                    await page.goto(chapter.src);
                    await delay(1000);

                    await page.click('.ms-1')

                    const elements = Array.from(await page.$$("#viewer .item"));
                    const data = await Promise.all(
                        elements.map(async (imageBody: any) => {
                            const content = await imageBody.evaluate((e: any) => {
                                const imgElement = e.querySelector('img');
                                const pageElement = e.querySelector('.page-num');

                                const imageUrl = imgElement ? imgElement.src : null;
                                const chapterText = pageElement ? pageElement.innerText : null;
                                const pageNumber = pageElement ? Number(pageElement.innerText.split(' / ')[0]) : null;
                                const totalPages = pageElement ? Number(pageElement.innerText.split(' / ')[1]) : null;

                                return {
                                    imageUrl,
                                    pageNumber,
                                    totalPages,
                                    chapterText,
                                };
                            });

                            return content;
                        })
                    );

                    // // download the images
                    // console.log("Downloading chapter images...");
                    // downloadChapter(chapter, manga, data)

                    mangaData = {
                        ...manga,
                        chapters: data
                    }

                    // console.log("mangaData", mangaData);
                }
            }

            async function downloadManga(data: any) {

                // create the mangas folder if it does not exist and create the manga folder if it does not exist
                if (!fs.existsSync("./mangas")) {
                    console.log("No mangas folder found. Creating mangas folder...");
                    fs.mkdirSync("./mangas");
                    if (!fs.existsSync(`./mangas/${data.title}`)) {
                        console.log(`No manga folder found for ${data.title}. Creating manga folder...`);
                        fs.mkdirSync(`./mangas/${data.title}`);
                    }
                }

                try {

                    // download the imaage and save it to the chapter folder as the manga profile image
                    let fileName = `./mangas/${data.title}/profile.jpg`;

                    // check if the file already exists
                    if (fs.existsSync(fileName)) {
                        // read the existing file and check if it's the same
                        const existingFile = fs.readFileSync(fileName);
                        const newFile = await fetch(data.img).then((res: any) => res.buffer());
                        if (existingFile.equals(newFile)) {
                            console.log(`Skipped ${fileName}`);
                        } else {
                            // add a number to the file name if it already exists but is not the same
                            let i = 1;
                            while (fs.existsSync(`./mangas/${data.title}/profile-${i}.jpg`)) {
                                i++;
                            }
                            fileName = `./mangas/${data.title}/profile-${i}.jpg`;
                        }
                    }
                    // download the file and save it
                    const response = await fetch(data.img);
                    const buffer = await response.buffer();
                    fs.writeFileSync(fileName, buffer);
                    console.log(`Downloaded ${fileName}`);

                }
                catch (e) {
                    console.log("download failed", e, e.message);
                }
            }

            async function downloadChapter(chapter: any, manga: any, data: any) {

                // create the mangas folder if it does not exist and create the manga folder if it does not exist and create the chapter folder if it does not exist
                if (!fs.existsSync("./mangas")) {
                    console.log("No mangas folder found. Creating mangas folder...");
                    fs.mkdirSync("./mangas");
                    console.log(`Created mangas folder. Creating manga folder...`);

                }
                if (!fs.existsSync(`./mangas/${manga.title}`)) {
                    console.log(`No manga folder found for ${manga.title}. Creating manga folder...`);
                    fs.mkdirSync(`./mangas/${manga.title}`);
                    console.log(`Created manga folder for ${manga.title}. Creating chapter folder...`);

                }
                if (!fs.existsSync(`./mangas/${manga.title}/${chapter.chapterTitle}`)) {
                    console.log(`No chapter folder found for ${chapter.chapterTitle}. Creating chapter folder...`);
                    fs.mkdirSync(`./mangas/${manga.title}/${chapter.chapterTitle}`);

                }

                try {
                    // loop through the data and download each image and save it to the chapter folder with the page number as the file name
                    for (const image of data) {
                        let fileName = `./mangas/${manga.title}/${chapter.chapterTitle}/${image.pageNumber}.jpg`;

                        // check if the file already exists
                        if (fs.existsSync(fileName)) {
                            // read the existing file and check if it's the same
                            const existingFile = fs.readFileSync(fileName);
                            const newFile = await fetch(image.imageUrl).then((res: any) => res.buffer());
                            if (existingFile.equals(newFile)) {
                                console.log(`Skipped ${fileName}`);
                            } else {
                                // add a number to the file name if it already exists but is not the same
                                let i = 1;
                                while (fs.existsSync(`./mangas/${manga.title}/${chapter.chapterTitle}/${image.pageNumber}-${i}.jpg`)) {
                                    i++;
                                }
                                fileName = `./mangas/${manga.title}/${chapter.chapterTitle}/${image.pageNumber}-${i}.jpg`;
                            }
                        }
                        // download the file and save it
                        const response = await fetch(image.imageUrl);
                        const buffer = await response.buffer();
                        fs.writeFileSync(fileName, buffer);
                        console.log(`Downloaded ${fileName}`);
                    }

                }
                catch (e) {
                    console.log("download failed", e, e.message);
                }
            }

            await page.close();

        } catch (e) {
            console.log("scrape failed", e);
        } finally {
            await browser?.close();
        }



        console.log("Finished scraping page", i, "of", 2553);
    }




}

run();
