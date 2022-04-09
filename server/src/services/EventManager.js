/* eslint-disable no-console */
const { promises: fs } = require('fs')
const { generate } = require('../../scripts/generateMasterfile')
const fetchJson = require('./api/fetchJson')
const initWebhooks = require('./initWebhooks')

module.exports = class EventManager {
  constructor(config, masterfile, Db) {
    this.masterfile = masterfile
    this.invasions = masterfile.invasions
    this.available = { gyms: [], pokestops: [], pokemon: [], nests: [] }
    this.uicons = []
    this.baseUrl = 'https://raw.githubusercontent.com/WatWowMap/wwm-uicons/main/'
    this.webhookObj = {}

    this.setTimers(config, Db);
    (async () => {
      // Set initials
      await this.getUicons(config.icons.styles)
      this.available.gyms = await Db.updateAvailable('Gym')
      this.available.nests = await Db.updateAvailable('Nest')
      this.available.pokemon = await Db.updateAvailable('Pokemon')
      this.available.pokestops = await Db.updateAvailable('Pokestop')
      await this.getMasterfile()
      await this.getInvasions()
      await this.getWebhooks(config)
    })()
  }

  setTimers(config, Db) {
    setInterval(async () => {
      this.available.gyms = await Db.updateAvailable('Gym')
    }, 1000 * 60 * 60 * (config.api.queryUpdateHours.raids || 1))
    setInterval(async () => {
      this.available.nests = await Db.updateAvailable('Nest')
    }, 1000 * 60 * 60 * (config.api.queryUpdateHours.nests || 6))
    setInterval(async () => {
      this.available.pokemon = await Db.updateAvailable('Pokemon')
    }, 1000 * 60 * 60 * (config.api.queryUpdateHours.pokemon || 1))
    setInterval(async () => {
      this.available.pokestops = await Db.updateAvailable('Pokestop')
    }, 1000 * 60 * 60 * (config.api.queryUpdateHours.quests || 3))
    setInterval(async () => {
      await this.getUicons(config.icons.styles)
    }, 1000 * 60 * 60 * (config.icons.cacheHrs || 3))
    setInterval(async () => {
      await this.getInvasions()
    }, 1000 * 60 * 60 * (config.map.invasionCacheHrs || 1))
    setInterval(async () => {
      await this.getMasterfile()
    }, 1000 * 60 * 60 * (config.map.masterfileCacheHrs || 6))
    setInterval(async () => {
      await this.getWebhooks(config)
    }, 1000 * 60 * 60 * (config.map.webhookCacheHrs || 1))
  }

  async getUicons(styles) {
    console.log('[EVENT] Fetching Latest UICONS')
    if (!styles.some(icon => icon.path === this.baseUrl)) {
      styles.push({
        name: 'Base',
        path: this.baseUrl,
        modifiers: {
          gym: {
            0: 1,
            1: 1,
            2: 1,
            3: 3,
            4: 4,
            5: 4,
            6: 18,
            sizeMultiplier: 1.2,
          },
        },
      })
    }
    this.uicons = await Promise.all(styles.map(async style => {
      const response = style.path.startsWith('http')
        ? await fetchJson(`${style.path}/index.json`)
        : await fs.readFile(`../../../public/images/uicons/${style.path}/index.json`)
      return { ...style, data: response }
    }))
  }

  async getInvasions() {
    console.log('[EVENT] Fetching Latest Invasions')
    try {
      this.invasions = await fetchJson('https://raw.githubusercontent.com/ccev/pogoinfo/v2/active/grunts.json')
        .then(response => Object.fromEntries(
          Object.entries(this.invasions).map(([type, info]) => {
            const latest = response ? response[type] : {}
            const newInvasion = this.invasions[type]
            if (info.encounters) {
              Object.keys(info.encounters).forEach((position, i) => {
                if (latest && latest.active) {
                  newInvasion.encounters[position] = latest.lineup.team[i].map((pkmn, j) => (
                    pkmn.template === 'UNSET' && info.encounters[position][j]
                      ? info.encounters[position][j]
                      : { id: pkmn.id, form: pkmn.form }))
                  newInvasion.second_reward = latest.lineup.rewards.length > 1
                }
              })
            }
            return [type, newInvasion]
          }),
        ))
    } catch (e) {
      console.log(e)
    }
  }

  async getMasterfile() {
    console.log('[EVENT] Fetching Latest Masterfile')
    this.masterfile = await generate()
      .then((masterfile) => {
        try {
          Object.entries(this.available).forEach(([category, entries]) => {
            entries.forEach(item => {
              if (!Number.isNaN(parseInt(item.charAt(0)))) {
                const [id, form] = item.split('-')
                if (!masterfile.pokemon[id]) {
                  masterfile.pokemon[id] = {
                    pokedexId: +id,
                    types: [],
                    quickMoves: [],
                    chargeMoves: [],
                  }
                  console.log(`[MF] Added ${id} to Pokemon`)
                }
                if (!masterfile.pokemon[id].forms) {
                  masterfile.pokemon[id].forms = {}
                }
                if (!masterfile.pokemon[id].forms[form]) {
                  masterfile.pokemon[id].forms[form] = { name: '*', category }
                  console.log(`[MF] Added ${masterfile.pokemon[id].name} Key: ${item} to masterfile. (${category})`)
                }
              }
            })
          })
        } catch (e) {
          console.warn(e, '\nUnable to add missing items to the filters')
        }
        return masterfile
      })
  }

  async getWebhooks(config) {
    await Promise.all(config.webhooks.map(async webhook => {
      this.webhookObj = { ...this.webhookObj, [webhook.name]: await initWebhooks(webhook, config) }
    }))
  }
}
