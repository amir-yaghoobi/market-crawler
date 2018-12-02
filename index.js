const request = require('superagent')
const cheerio = require('cheerio')
const Promise = require('bluebird')
const Sequelize = require('sequelize')
const express = require('express')
const appModel = require('./models/applications')
const json2csv = require('json2csv').parse;

const mysqlUser = process.env.MYSQL_USER
const mysqlPassword = process.env.MYSQL_PASS

const sequelize = new Sequelize('marketInstallation', mysqlUser, mysqlPassword, {
  host: 'localhost',
  dialect: 'mysql',
  port: 3306,
  logging: false,
  dialectOptions: {
    charset: 'utf8mb4'
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  operatorsAliases: false
});

const Application = appModel(sequelize)

sequelize.sync()
    .then(() => {
      console.log('connected')

      // const bundleId = 'com.piccolo.footballi.server'
      // return getCafeBazaarStats(bundleId)
      //     .then(stats => {
      //       const {appName, category, cafeBazaarInstalls, cafeBazaarPrice} = stats
      //       return Application
      //           .upsert({bundleId, appName, category, cafeBazaarInstalls, cafeBazaarPrice})
      //           .then(_ => {
      //             console.log('cafebazaar updated', bundleId, cafeBazaarInstalls)
      //           })
      //     }).catch(err => {
      //       console.error('cannot getCafeBazaar stats', bundleId, err.message)
      //     })

      return loadCategories()
          .then(categories => {
            console.log(categories)
            return Promise.each(categories, category => {
                console.time('processing category ' + category.name)
                return getApplicationsBundleId(category)
                    .then(bundleIds => {
                      return Promise.map(bundleIds, bundleId => {
                        console.time('cafeBazaar ' + bundleId)
                        return getCafeBazaarStats(bundleId)
                            .then(stats => {
                              console.timeEnd('cafeBazaar ' + bundleId)
                              console.time('playStore ' + bundleId)

                              return getPlayStoreStats(bundleId)
                                  .then(pass => pass)
                                  .catch(err => {
                                    if (err.status === 404) {
                                      return {playStoreInstalls: -1}
                                    }
                                    if (err.code === 'ECONNRESET') {
                                      console.error('reached to playStore limitation for bundleId', bundleId)
                                      return {playStoreInstalls: -100}
                                    }
                                    console.error('playStore error', err)
                                  })
                                  .then(({playStoreInstalls}) => {
                                    console.timeEnd('playStore ' + bundleId)
                                    const {appName, category, cafeBazaarInstalls, cafeBazaarPrice} = stats
                                    stats.bundleId = bundleId
                                    stats.playStoreInstalls = playStoreInstalls

                                    // console.log('updating bundleId: %s, cafeBazaarInstalls: %s, playStoreInstalls: %s',
                                    //     bundleId, cafeBazaarInstalls, playStoreInstalls)

                                    Application
                                        .upsert({
                                          bundleId,
                                          appName,
                                          category,
                                          cafeBazaarInstalls,
                                          cafeBazaarPrice,
                                          playStoreInstalls
                                        })
                                        .then(_ => {

                                        })
                                    return stats
                                  })
                            })
                      })
                    })
                    .catch(err => {
                      console.error('cannot get applications of this category', category)
                    }).then(_ => console.timeEnd('processing category ' + category.name))
            })
          })
    })


function searchCafeBazaar(query) {
  return request
      .get('https://cafebazaar.ir/search/')
      .query({q: query, l: 'en'})
      .then(({text}) => {
        const $ = cheerio.load(text)
        const apps = $('.msht-app > a').map((_, a_tag) => {
          const link = a_tag.attribs.href.trim()
          const bundleId = link.split('/')[2]
          return bundleId
        }).get()
        return apps
      })
}

function loadCategories() {
  return request.get('https://cafebazaar.ir/cat/')
      .query({l: 'en'})
      .then(({text}) => {
        const $ = cheerio.load(text)
        return $('a[href]').map((_, link) => {
          const category = link.attribs.href.split('/')[2]
          return {
            name: category,
            link: `https://cafebazaar.ir/lists/${category}-top-rated/`
          }
        }).get()
      })
}

function getCafeBazaarStats(bundleId) {
  return request
      .get('https://cafebazaar.ir/app/' + bundleId)
      .query({l: 'en'})
      .then(({text}) => {
        const $ = cheerio.load(text)
        const appName = $('.app-name').first().text().trim()
        const container = $('.container .app-container').first().children().first()
        const installSection = container.find('.pull-right > span').first().text()
        const category = container.find('.pull-right > a > span').first().text().toLowerCase()
        const price = $('a[href=#dlAppModal]').text().trim()
        let installCount = Number(installSection.replace(/[,\+]/g, ''))
        if (isNaN(installCount)) {
          installCount = Number(installSection.replace('less than', '').trim())
        }

        return {
          cafeBazaarInstalls: installCount,
          cafeBazaarPrice: price,
          appName,
          category
        }
      })
}

// TODO implement playStore
function getPlayStoreStats(bundleId) {
  return request
      .get('https://play.google.com/store/apps/details?id=' + bundleId)
      .then(({text}) => {
        const $ = cheerio.load(text)
        const installSection = $('span .htlgb').slice(2,-1).html()
        let installCount = Number(installSection.replace(/[,\+]/g, ''))

        return {
          playStoreInstalls: installCount
        }
      })
}

function getApplicationsBundleId(category) {
  return request
      .get(category.link)
      .query({l: 'en'})
      .then(({text}) => {
        const $ = cheerio.load(text)
        const apps = $('.msht-app > a').map((_, a_tag) => {
          const link = a_tag.attribs.href.trim()
          const bundleId = link.split('/')[2]
          return bundleId
        }).get()
        return apps
      })
}


const app = express()

app.get('/', function (req, res) {
  let responseType = req.query.result
  if (!responseType || responseType !== 'csv') {
    responseType = 'json'
  }

  Application.findAll({order: [['cafeBazaarInstalls', 'desc']]})
      .then(apps => {
        const result = apps.map(app => {
          const data = app.dataValues

          return {...data}
        })

        if (responseType === 'csv') {
          const csv = json2csv(result, {fields: Object.keys(result[0]), eol: '\r\n'});
          res.attachment('applications.csv');
          return res.send(csv)
        }
        res.json(result)
      })
})


app.get('/search/:query', function(req, res) {

  let responseType = req.query.result
  if (!responseType || responseType !== 'csv') {
    responseType = 'json'
  }
  let { query } = req.params
  query = query.split(' ').join('+')

  return searchCafeBazaar(query)
      .then(bundleIds => {
          return Promise.map(bundleIds, bundleId => {
            return getCafeBazaarStats(bundleId)
                .then(stats => {
                  return getPlayStoreStats(bundleId)
                      .then(pass => pass)
                      .catch(err => {
                        if (err.status === 404) {
                          return {playStoreInstalls: -1}
                        }
                        if (err.code === 'ECONNRESET') {
                          console.error('reached to playStore limitation for bundleId', bundleId)
                          return {playStoreInstalls: -100}
                        }
                        console.error('playStore error', err)
                      })
                      .then(({playStoreInstalls}) => {
                        const {appName, category, cafeBazaarInstalls, cafeBazaarPrice} = stats
                        stats.bundleId = bundleId
                        stats.playStoreInstalls = playStoreInstalls

                        console.log('updating bundleId: %s, appName: %s, category: %s, cafeBazaarInstalls: %s, cafeBazaarPrice: %s, playStoreInstalls: %s',
                            bundleId, appName, category, cafeBazaarInstalls, cafeBazaarPrice, playStoreInstalls)

                        Application
                            .upsert({bundleId, appName, category, cafeBazaarInstalls, cafeBazaarPrice, playStoreInstalls})
                            .catch(err => {console.error('cannot insert to mysql', err)})
                        return stats
                      })
                }).catch(err => {
                  console.error('cannot getCafeBazaar stats', bundleId, err.message)
                  return null
                })
          })
              .then(result => {
                result = result.sort((a, b) => b.cafeBazaarInstalls - a.cafeBazaarInstalls)

                if (responseType === 'csv') {
                  const csv = json2csv(result, {fields: Object.keys(result[0]), eol: '\r\n'});
                  res.attachment('search-result.csv');
                  return res.send(csv)
                }
                return res.json(result)
              })
      })
})

app.listen(3000)