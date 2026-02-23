#!/usr/bin/env python3

from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from urllib.parse import urlparse
import json
import os
import re

script_dir = Path(__file__).resolve().parent

def get_chrome_options():
    options = Options()
    options.add_argument("--start-maximized")  # open full screen
    options.add_argument(
        "--disable-blink-features=AutomationControlled"
    )
    return options

def write_file(path, contents):
    file_path = script_dir / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(contents)

data = {
    'scriptures': {
        'href': "https://www.churchofjesuschrist.org/study/scriptures?lang=eng",
        'works': []
    }
}

driver = webdriver.Chrome(options=get_chrome_options())
driver.get(data['scriptures']['href'])

def add_scripture_book(title):
    href = driver.find_element(By.XPATH, f"//*[starts-with(@class, 'portraitTitle') and text() = '{title}']/parent::a").get_attribute('href')
    data['scriptures']['works'].append({
        'title': title,
        'href': href,
        'books': []
    })

add_scripture_book('Old Testament')
add_scripture_book('New Testament')
add_scripture_book('The Book of Mormon')
add_scripture_book('Doctrine and Covenants')
add_scripture_book('Pearl of Great Price')

for work in data['scriptures']['works']:
    driver.get(work['href'])
    books = driver.find_elements(By.XPATH, "//nav[starts-with(@class, 'tableOfContents')]/ul/li[.//span[text() != 'Contents']]")
    for book in books:
        svg = book.find_elements(By.XPATH, ".//*[local-name() = 'svg']")
        if svg:
            svg[0].click()
            segments = []
            for segment in book.find_elements(By.XPATH, ".//ul[starts-with(@class, 'subItems')]/li[.//span[text() != 'Contents']]"):
                segments.append({
                    'title': segment.find_element(By.XPATH, ".//span").text,
                    'href': segment.find_element(By.XPATH, './/a').get_attribute('href')
                })
            work['books'].append({
                'title': book.find_element(By.XPATH, ".//span[starts-with(@class, 'sectionTitle')]//span").text,
                'segments': segments
            })
        else:
            lisections = book.find_elements(By.XPATH, ".//ul[@id = 'lisections']/li[.//span[text() != 'Contents']]")
            if lisections:
                for segment in lisections:
                    title = segment.find_element(By.XPATH, ".//span").text
                    work['books'].append({
                        'title': title,
                        'segments': [
                            {
                                'title': title,
                                'href': segment.find_element(By.XPATH, './/a').get_attribute('href')
                            }
                        ]
                    })
            else:
                title = book.find_element(By.XPATH, './/span').text
                work['books'].append({
                    'title': title,
                    'segments': [
                        {
                            'title': f"{title} 1",
                            'href': book.find_element(By.XPATH, './/a').get_attribute('href')
                        }
                    ]
                })


for work in data['scriptures']['works']:
    for book in work['books']:
        for segment in book['segments']:
            verses = []
            segment_file = {
                'work': work['title'],
                'book': book['title'],
                'verses': verses
            }
            parsed = urlparse(segment['href'])
            app_path = f"{parsed.path}.json"
            output_path = f"website/{app_path}"
            original_href = segment['href']
            segment['href'] = app_path
            if not Path(script_dir / output_path).exists():
                driver.get(original_href)
                for el in driver.find_elements(By.XPATH, "//article//div[@class = 'body-block']/*"):
                    text = el.text
                    match = re.match(r"^\s*(\d+)\s+(.*)", text)
                    verses.append({
                        'text': match.group(2) if match else text
                    })
                directory = f"website/{os.path.dirname(segment['href'])}"
                os.makedirs(directory, exist_ok=True)
                write_file(output_path, json.dumps(segment_file, indent=2))

write_file('website/nav.json', json.dumps(data, indent=2))
driver.quit()
