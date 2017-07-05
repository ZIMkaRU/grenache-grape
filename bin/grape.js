#!/usr/bin/env node
'use strict'

const _ = require('lodash')
const Grape = require('../lib/Grape')

const program = require('yargs')
  .option('b', {
    describe: 'Listening host',
    alias: 'bind',
    type: 'string'
  })
  .option('dp', {
    describe: 'DHT listening port',
    alias: 'dht_port',
    type: 'number',
    demand: true
  })
  .option('dc', {
    describe: 'DHT concurrency',
    alias: 'dht_concurrency',
    type: 'number'
  })
  .option('dht_maxTables', {
    describe: 'DHT max tables',
    type: 'number'
  })
  .option('bn', {
    describe: 'Bootstrap nodes',
    alias: 'bootstrap',
    type: 'string',
    demand: true
  })
  .option('aph', {
    describe: 'HTTP api port',
    alias: 'api_port',
    type: 'number',
    demand: true
  })
  .option('ts', {
    describe: 'Timeslot',
    alias: 'timeslot',
    type: 'number'
  })
  .option('cache_maxAge', {
    describe: 'Maximum cache age',
    type: 'number'
  })
  .help('help')
  .version()
  .example('grape --dp 20001 --dc 32 --aph 30001 --bn \'127.0.0.1:20002,127.0.0.1:20003\'')
  .example('grape --dp 20002 --dc 32 --b 127.0.0.1 --aph 40001 --bn \'127.0.0.1:20001,127.0.0.1:20003\'')
  .example('grape --dp 20003 --dc 32 --aph 50001 --bn \'127.0.0.1:20001,127.0.0.1:20002\'')
  .usage('Usage: $0 --dp <dht-port> --aph <http-api-port> --bn <nodes> [--b bind-to-address]')
  .argv

const dhtPort = program.dp
const apiPort = program.aph
const bind = program.b
const timeslot = program.ts
const maxCacheAge = program.cache_maxAge
const maxDhtTables = program.dht_maxTables

const dhtBoostrap = _.reduce((program.bn || '').split(','), (acc, e) => {
  if (e) {
    acc.push(e)
  }
  return acc
}, [])

const g = new Grape({
  host: bind,
  dht_port: dhtPort,
  dht_bootstrap: dhtBoostrap,
  dht_maxTables: maxDhtTables,
  api_port: apiPort,
  timeslot: timeslot,
  cache_maxAge: maxCacheAge
})

g.start(() => {})
