const request = require('superagent')
const cheerio = require('cheerio')

function loadCategories() {
  return request.get('https://cafebazaar.ir/cat/')
      .query({l: 'en'})
      .then(({text}) => {
        const $ = cheerio.load(text)
        const categories = $('a[href]').map((_, link) => {
          const category = link.attribs.href.split('/')[2]
          return {
            category,
            link: `https://cafebazaar.ir/lists/${category}-top-rated/`
          }
        }).get()
        return categories
      })
}

function getApplicationInformation(appLink) {
  return request
      .get(appLink)
      .then(({text}) => {
        const $ = cheerio.load(text)
        const appName = $('.app-name').first().text().trim()
        console.log('application name', appName)
      })
}

function getApplications(category) {
  return request
      .get(category.link)
      .query({l: 'en'})
      .then(({text}) => {
        const $ = cheerio.load(text)
        const apps = $('.msht-app > a').map((_, a_tag) => {
          const link = a_tag.attribs.href.trim()
          const bundleId = link.split('/')[2]
          return {
            bundleId: bundleId,
            link: 'https://cafebazaar.ir' + link
          }
        }).get()

        // getApplicationInformation(apps[0].link)
        console.log(apps)
        return apps
      })
}

getApplications({ category: 'sports',
  link: 'https://cafebazaar.ir/lists/sports-top-rated/' })

// loadCategories()
// .then(categories => {
//   console.log(categories)
//   // categories.forEach(cat => {
//   // return getApplicationInformation(cat)
//   // })
//   // console.log(categories)
// })