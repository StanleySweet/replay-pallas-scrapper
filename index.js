/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { launch } from 'puppeteer';
import axios from 'axios';
import pkg from 'bcryptjs';
const { hash } = pkg;
import AdmZip from 'adm-zip';
import 'dotenv/config'

const urls = [
    // 'https://wildfiregames.com/forum/topic/27531-valihrant-vs-feldfeld-series-of-5',
    // 'https://wildfiregames.com/forum/topic/67875-ratings-disputes-and-offence-reporting',
    'https://wildfiregames.com/forum/topic/95448-0-ad-friendly-tournament-series/'
    // 'https://wildfiregames.com/forum/topic/110002-epic-replays-a26/',
    // 'https://wildfiregames.com/forum/topic/109470-4vs4-on-sunday-101223/',
    // 'https://wildfiregames.com/forum/topic/107700-2v2-nomad-tom0ad-and-seeh-vs-umbritu-and-komakio/',
    // 'https://wildfiregames.com/forum/topic/66448-0ad-newbie-rush-game-replay-archive-alpha-25/'

]

for (const url of urls) {
    (async () => {
        console.log(process.env)
        const browser = await launch();
        const page = await browser.newPage();
        const apiUrl = process.env.API_URL;
        const login = process.env.LOGIN;
        const password = process.env.PASSWORD;
        const passwordSalt = process.env.PASSWORD_SALT;
        const loginSalt = process.env.LOGIN_SALT;
        const uploadUrl = `${apiUrl}/replays/upload-zip`;
        const tokenUrl = `${apiUrl}/users/token`;
        let token = null;
        hash(password, passwordSalt, function (err, hashedPassword) {
            if (err) {
                console.error(err);
                return;
            }
            hash(login, loginSalt, async function (err2, hashedEmail) {
                if (err2) {
                    console.error(err2);
                    return;
                }

                var response = await axios.post(tokenUrl, {
                    email: hashedEmail,
                    password: hashedPassword,
                })

                if (response.status !== 200) {
                    console.log(response)
                    return;
                }
                else {
                    token = response.data.token
                }
            });
        });

        await page.goto(url);
        console.log(`Loading page`)
        let pages = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".ipsFieldRow > input.ipsField_fullWidth")).map(a => { return { "max": a.max, "min": a.min } })[0]
        })
        if (!pages)
            pages = { min: 1, max: 1 }
        for (let i = +pages.min; i <= +pages.max; ++i) {
            console.log(`Loading page - 0${i}`)
            await page.goto(`${url}/page/${i}/`);
            const result = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('article')).map(a => {
                    return {
                        "author": a.querySelector('aside > .ipsType_sectionHead.cAuthorPane_author.ipsType_blendLinks.ipsType_break').textContent.trim(),
                        "files": Array.from(a.querySelectorAll('.ipsAttachLink.ipsAttachLink_block')).map(a => {
                            return {
                                "link": a.href,
                                "extension": a.dataset.fileext
                            }
                        })
                    }
                }).filter(a => a.files.length > 0);;
            })

            console.log(`Getting files for ${[...new Set(result.map(a => a.author))].join(", ")}'s`)

            for (const report of result) {
                for (const file of report.files) {
                    try {
                        const response = await axios.get(file.link, file.extension !== "txt" && file.extension !== "json" ? {
                            responseType: 'arraybuffer'
                        } : undefined)
                        file.data = response.data
                    }
                    catch (e) {
                        console.log("Could not download " + file.link + "." + file.extension)
                        continue;
                    }
                }

                var zipFile = report.files.find(a => a.extension === "zip")
                var zip = null;
                if (!zipFile) {
                    zip = new AdmZip();
                    var commands = report.files.find(a => a.extension === "txt" && a.data)
                    var metadata = report.files.find(a => a.extension === "json" && a.data)
                    if (!commands && !metadata && report.files.length) {
                        try {
                            zip = new AdmZip(report.files[0].data);
                        }
                        catch (e) {
                            console.log(e)
                            continue;
                        }
                    }
                    else {
                        if (commands)
                            zip.addFile('commands.txt', Buffer.from(commands.data, 'utf8'), 0o644);
                        if (metadata) {
                            zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata.data), 'utf8'), 0o644);
                        }
                    }

                }
                else {
                    zip = new AdmZip(zipFile.data);
                }

                const formData = {
                    file: {
                        value: zip.toBuffer(),
                        options: {
                            filename: 'commands.zip',
                            contentType: 'application/zip'
                        }
                    }
                };
                const uploadResult = await axios.post(uploadUrl, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });

                console.log(uploadResult.data)
            }
            console.log(`Done loading page - 0${i}`)
        }
        await browser.close();

    })();
}




