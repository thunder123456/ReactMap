/* eslint-disable no-console */
const passport = require('passport')
const Strategy = require('passport-local')
const bcrypt = require('bcrypt')
const path = require('path')

const { name } = path.parse(__filename)

const {
  map: { forceTutorial },
  authentication: { [name]: strategyConfig, alwaysEnabledPerms, perms },
} = require('../services/config')
const { Db } = require('../services/initialization')
const Utility = require('../services/Utility')

if (strategyConfig.doNothing) {
  // This is for nothing other than demonstrating a custom property you can add if you need it
}

const authHandler = async (_req, username, password, done) => {
  const localPerms = Object.keys(perms).filter((key) =>
    perms[key].roles.includes('local'),
  )
  const user = {
    perms: {
      ...Object.fromEntries(
        Object.keys(perms).map((perm) => [
          perm,
          localPerms.includes(perm) || alwaysEnabledPerms.includes(perm),
        ]),
      ),
      areaRestrictions: Utility.areaPerms(localPerms, 'local'),
      webhooks: [],
      scanner: [],
    },
    rmStrategy: path.parse(__filename).name,
  }

  try {
    await Db.models.User.query()
      .findOne({ username })
      .then(async (userExists) => {
        if (!userExists) {
          try {
            const newUser = await Db.models.User.query().insertAndFetch({
              username,
              password: await bcrypt.hash(password, 10),
              strategy: 'local',
              tutorial: !forceTutorial,
            })
            user.id = newUser.id
            console.log(
              `[${name.toUpperCase()}]`,
              user.username,
              `(${user.id})`,
              'Authenticated successfully.',
            )
            return done(null, user)
          } catch (e) {
            return done(null, user, { message: 'error_creating_user' })
          }
        }
        if (bcrypt.compareSync(password, userExists.password)) {
          ;['discordPerms', 'telegramPerms'].forEach((permSet) => {
            if (userExists[permSet]) {
              user.perms = Utility.mergePerms(user.perms, userExists[permSet])
            }
          })
          if (userExists.strategy !== 'local') {
            await Db.models.User.query()
              .update({ strategy: 'local' })
              .where('id', userExists.id)
            userExists.strategy = 'local'
          }
          user.id = userExists.id
          console.log(
            `[${name.toUpperCase()}]`,
            user.username,
            `(${user.id})`,
            'Authenticated successfully.',
          )
          return done(null, user)
        }
        return done(null, false, { message: 'invalid_credentials' })
      })
  } catch (e) {
    console.error(
      `[${name.toUpperCase()}]`,
      'User has failed authentication.',
      e.message,
    )
  }
}

passport.use(
  path.parse(__filename).name,
  new Strategy(
    {
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true,
    },
    authHandler,
  ),
)

module.exports = null
