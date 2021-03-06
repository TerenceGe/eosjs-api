const camelCase = require('camel-case')
const helpers = require('./exported-helpers')
const processArgs = require('./process-args')

module.exports = apiGen

function apiGen (version, definitions, config) {
  config = Object.assign({
    httpEndpoint: 'http://127.0.0.1:8888',
    verbose: false
  }, config)

  const defaultLogger = {
    log: config.verbose ? console.log : '',
    error: console.error
  }

  config.logger = Object.assign({}, defaultLogger, config.logger)

  const api = {}
  const {httpEndpoint} = config

  for (const apiGroup in definitions) {
    for (const apiMethod in definitions[apiGroup]) {
      const methodName = camelCase(apiMethod)
      const url = `${httpEndpoint}/${version}/${apiGroup}/${apiMethod}`
      api[methodName] = fetchMethod(methodName, url, definitions[apiGroup][apiMethod], config)
    }
  }
  for(const helper in helpers.api) {
    // Insert `api` as the first parameter to all API helpers
    api[helper] = (...args) => helpers.api[helper](api, ...args)
  }
  return Object.assign(api, helpers)
}

function fetchMethod (methodName, url, definition, config) {
  const {logger} = config

  return function (...args) {
    if (args.length === 0) {
      console.log(usage(methodName, definition))
      return
    }

    const optionsFormatter = option => {
      if(typeof option === 'boolean') {
        return {broadcast: option}
      }
    }

    const processedArgs = processArgs(args, Object.keys(definition.params || []), methodName, optionsFormatter)

    const {params, options, returnPromise} = processedArgs
    let {callback} = processedArgs

    const body = JSON.stringify(params)
    if (logger.log) {
      logger.log('api >', 'post', '\t', url, body)
    }
    const fetchConfiguration = {body, method: 'POST'}
    Object.assign(fetchConfiguration, config.fetchConfiguration)

    fetch(url, fetchConfiguration).then(response => {
      if (response.status >= 200 && response.status < 300) {
        return response.json()
      } else {
        return response.text().then(bodyResp => {
          const error = { message: bodyResp }
          error.status = response.status
          error.statusText = response.statusText
          return Promise.reject(error)
        })
      }
    }).then(objectResp => {
      try {
        callback(null, objectResp)
      } catch(callbackError) {
      }
    })
    .catch(error => {
      let message = ''
      try {
        // nodeos format (fail safe)
        message = JSON.parse(error.message).error.details[0]
      } catch(e2) {}
      try {
        callback(error)
      } catch(callbackError) {
      }
    })

    return returnPromise
  }
}

function usage (methodName, definition) {
  let usage = ''
  const out = str => {
    usage += str + '\n'
  }

  out(`USAGE`)
  out(`${methodName} - ${definition.brief}`)

  out('\nPARAMETERS')
  if (definition.params) {
    out(JSON.stringify(definition.params, null, 2))
  } else {
    out('none')
  }

  out('\nRETURNS')
  if (definition.results) {
    out(`${JSON.stringify(definition.results, null, 2)}`)
  } else {
    out(`no data`)
  }

  out('\nERRORS')
  if (definition.errors) {
    for (const error in definition.errors) {
      const errorDesc = definition.errors[error]
      out(`${error}${errorDesc ? ` - ${errorDesc}` : ''}`)
    }
  } else {
    out(`nothing special`)
  }

  return usage
}
