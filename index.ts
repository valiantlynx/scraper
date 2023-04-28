
import puppeteer from "puppeteer-core";
const fetch = require("node-fetch");
const fs = require("fs");

async function run() {
    let browser;
    const pageNumber = 1;

    const url = `https://mangapark.net/browse?page=${pageNumber}`;

    try {
        
        browser = await puppeteer.connect({
            browserWSEndpoint: 'wss://chrome.browserless.io?token=7fc44ee7-19d6-4da4-9bde-5b445b58414c',
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(2 * 60 * 1000);

        // go to the url and get the manga list
        await page.goto(url);

        await page.waitForSelector("#subject-list");

        await page.screenshot({ path: "screenshot.png" });

        const mangas = Array.from(await page.$$(".pb-3"));
        const data = await Promise.all(
            mangas.map(async (manga: any) => {
                const content = await manga.evaluate((e: any, url: any) => {
                    const titleElement = e.querySelector('.fw-bold')
                    const imgElement = e.querySelector('img')
                    const tagsElement = e.querySelector('.genres')
                    const chaptersElement = e.querySelector('.text-ellipsis-1')
                    const srcElement = e.querySelector('a')

                    return {
                        title: titleElement ? titleElement.innerText : null,
                        img: imgElement ? imgElement.getAttribute('src') : null,
                        tags: tagsElement ? tagsElement.innerText : null,
                        latestChapter: chaptersElement ? chaptersElement.innerText : null,
                        src: srcElement ? srcElement.href : null,
                    };
                }, url);

                return content;
            })
        );

        let mangaData: any = {}

        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

        // go to each manga page and get the image
        for (const manga of data) {
            console.log("Navigating to: ", manga.src);
            await page.goto(manga.src);
            await delay(2000);

            const elements = Array.from(await page.$$(".episode-item"));
            const data = await Promise.all(
                elements.map(async (chapterBody: any) => {
                    const content = await chapterBody.evaluate((e: any, url: any) => {
                        const srcElement = e.querySelector('a')

                        return {
                            src: srcElement ? srcElement.href : null,
                            chapterTitle: srcElement ? srcElement.innerText : null,
                        };
                    }, url);
                    return content;
                })
            );

            // go to each chapter page and get the images
            for (const chapter of data) {
                console.log("Navigating to: ", chapter.src);
                await page.goto(chapter.src);
                await delay(2000);

                await page.click('.ms-1')  
                
                const elements = Array.from(await page.$$("#viewer .item"));
                const data = await Promise.all(
                    elements.map(async (imageBody: any) => {
                        const content = await imageBody.evaluate((e: any, url: any) => {
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
                        }, url);

                        return content;
                    })
                );
                
                mangaData = {
                    ...manga,
                    chapters: data
                }

                console.log("mangaData", mangaData);
            }
        }


        // create the images folder if it does not exist
        if (!fs.existsSync("./mangas")) {
            console.log("No mangas folder found. Creating mangas folder...");
            fs.mkdirSync("./mangas");
        }

        // download each image and save it to the images folder
        await Promise.all(
            data.map(async (result) => {
                let fileName = `./mangas/${result.title}.jpg`;

                // check if the file already exists
                if (fs.existsSync(fileName)) {
                    // read the existing file and check if it's the same
                    const existingFile = fs.readFileSync(fileName);
                    const newFile = await fetch(result.img).then((res: any) => res.buffer());
                    if (existingFile.equals(newFile)) {
                        console.log(`Skipped ${fileName}`);
                        return;
                    } else {
                        // add a number to the file name if it already exists but is not the same
                        let i = 1;
                        while (fs.existsSync(`./mangas/${result.title}-${i}.jpg`)) {
                            i++;
                        }
                        fileName = `./mangas/${result.title}-${i}.jpg`;
                    }
                }

                // download the file and save it
                const response = await fetch(result.img);
                const buffer = await response.buffer();
                fs.writeFileSync(fileName, buffer);
                console.log(`Downloaded ${fileName}`);
            })
        );


        return;
    } catch (e) {
        console.log("scrape failed", e);
    } finally {
        await browser?.close();
    }
}

run();

