'use strict'

const DHT = require('bittorrent-dht')
const _ = require('lodash')
const async = require('async')
const http = require('http')
const Events = require('events')
const UWS = require('uws')
const debug = require('debug')('grenache:grape')

const noop = () => {}

class Grape extends Events {

  constructor(conf) {
    super()

    this.conf = _.defaults(conf, {
      dht_port: 20001,
      dht_bootstrap: [],
      api_port: null,
      api_port_http: null,
      timeslot: 2500
    })

    this._interface = {}

    this._active = false
    this._mem = {}
  }

  createNode(port, address, bootstrap, cb) {
    const dht = new DHT({
      host: address || false,
      bootstrap: bootstrap
    })

    dht.on('announce', (_peer, ih) => {
      const val = this.hex2str(ih)
      debug(port, 'announce', val)
    })

    dht.on('warning', () => {
      debug(port, 'warning')
    })

    dht.on('node', () => {
      debug(port, 'node')
    })

    dht.on('listening', () => {
      debug(port, 'listening')
    })

    dht.on('ready', () => {
      debug(port, 'ready')
    })

    dht.on('error', (err) => {
      debug(port, 'error', err)
    })

    dht.on('peer', (_peer, val, from) => {
      const ih = this.str2hex(val)

      if (!this._mem[ih]) {
        this._mem[ih] = {
          peers: {}
        }
      }

      const me = this._mem[ih]
      me._uts = Date.now()

      const peer = `${_peer.host}:${_peer.port}`

      me.peers[peer] = {
        host: peer,
        _uts: Date.now()
      }

      debug(port, 'found potential peer ' + peer + (from ? ' through ' + from.address + ':' + from.port : '') + ' for hash: ' + val)
    })

    dht.once('error', handleBootstrapError)

    function handleBootstrapError(err) {
      cb(err)
    }

    dht.listen(port, (err) => {
      dht.removeListener('error', handleBootstrapError)
      if (err) return cb(err)

      cb(null, dht)
    })
  }

  hex2str(val) {
    return (new Buffer(val, 'hex')).toString()
  }

  str2hex(val) {
    return (new Buffer(val)).toString('hex')
  }

  timeslot(offset, ts) {
    offset = offset || 0
    ts = ts || Date.now()
    ts -= offset * this.conf.timeslot * -1
    ts = ts - (ts % this.conf.timeslot)
  
    return ts
  }

  onRequest(type, data, cb) {
    const met = 'handlePeer' + _.upperFirst(_.camelCase('-' + type))

    if (!this[met]) {
      cb('ERR_REQ_NOTFOUND')
      return
    }

    this[met](data, cb)
  }

  handlePeerLookup(_val, cb) {
    if (!_val || !_.isString(_val)) {
      cb('ERR_GRAPE_LOOKUP')
      return
    }

    async.map([
      `${_val}-${this.timeslot(0)}`,
      `${_val}-${this.timeslot(-1)}`
    ], this.lookup.bind(this), (err, mapped) => {
      if (err) return cb(err)

      cb(null, _.union.apply(_, mapped))
    })
  }

  handlePeerAnnounce(announcement, cb) {
    if (!announcement || !_.isArray(announcement)) {
      return cb('ERR_GRAPE_ANNOUNCE')
    }

    const val = announcement[0]
    const port = announcement[1]

    this.announce(`${val}-${this.timeslot(0)}`, port, cb)
  }

  handlePeerPut(opts, cb) {
    this.put(opts, cb)
  }

  handlePeerGet(hash, cb) {
    this.get(hash, cb)
  }

  announce(val, port, cb) {
    cb = cb || noop
    this.node.announce(
      this.str2hex(val),
      port || this.conf.dht_port,
      cb
    )
  }

  lookup(val, cb) {
    cb = cb || noop

    const ih = this.str2hex(val)

    this.node.lookup(ih, (err) => {
      if (err) return cb(err)

      const me = this._mem[ih]
      if (me) {
        cb(null, _.keys(me.peers))
      } else {
        cb(null, [])
      }
    })
  }

  put(opts, cb) {
    cb = cb || noop

    this.node.put(opts, (err, res) => {
      if (err) return cb(err)

      cb(null, this.str2hex(res))
    })
  }

  get(hash, cb) {
    try {
      this.node.get(hash, (err, res) => {
        if (res) {
          res.id = this.str2hex(res.id)
          res.v = res.v.toString()
        }
        cb(err, res)
      })
    } catch(e) {
      e = e.toString()
      let msg = 'ERR_GRAPE_GENERIC'
      if (e.indexOf('Invalid hex string') > -1) {
        msg = 'ERR_GRAPE_HASH_FORMAT'
      }
      cb(null, msg)
    }
  }

  transportWs(cb) {
    const server = new UWS.Server({
      host: this.conf.host,
      port: this.conf.api_port
    }, (err) => {
      server.httpServer.removeListener('error', handleApiBootstrapError)

      if (err) return cb(err)

      server.on('connection', socket => {
        socket.on('message', msg => {
          msg = JSON.parse(msg)

          const rid = msg[0]
          const type = msg[1]
          const data = msg[2]
    
          this.onRequest(type, data, (err, res) => {
            debug('Grape.reply', rid, type, err, res)
            socket.send(JSON.stringify([rid, err || res]))
          })
        })
      })

      cb()
    })

    // We have to do this because UWS.Server does not call the callback with an error if the port is already in use.
    server.httpServer.once('error', handleApiBootstrapError)
    function handleApiBootstrapError (err) {
      cb(err)
    }

    this._interface.ws = server
  }

  transportHttp(cb) {
    if (!this.conf.api_port_http) return cb()

    let fetchRequest = (req, rep) => {
      let body = ''

      req.on('data', (data) => {
        body += data
      })

      req.on('end', () => {
        handleRequest(req, rep, body)
      })
    }

    let handleRequest = (req, rep, msg) => {
      msg = JSON.parse(msg)

      const type = req.url.substr(1)
      const rid = msg.rid
      const data = msg.data

      this.onRequest(type, data, (err, res) => {
        rep.end(JSON.stringify(err || res))
      })
    }

    const server = http.createServer(fetchRequest)

    const listen_args = [this.conf.api_port_http]
    
    if (this.conf.host) {
      listen_args.push(this.conf.host)
    }
    listen_args.push(cb)

    server.listen.apply(server, listen_args)
    
    this._interface.http = server
  }

  transports(cb) {
    async.series([
      (cb) => {
        this.transportWs(cb)
      },
      (cb) => {
        this.transportHttp(cb)
      }
    ], cb)
  }

  start(cb) {
    cb = cb || noop

    if (this._active) {
      debug('skipping start, since Grape is already active')
      return cb()
    }

    debug('starting')

    this.createNode(
      this.conf.dht_port,
      this.conf.host,
      this.conf.dht_bootstrap,
      (err, node) => {
        if (err) return cb(err)

        this.node = node

        this.transports((err) => {
          if (err) return cb(err)
          this._active = true
          cb()
        })
      }
    )
  }

  stop(cb) {
    async.series([
      (cb) => this.node ? this.node.destroy(cb) : cb(),
      (cb) => {
        // Transport.close does not accept a callback, but should since its underlying implementation accepts one
        // transport ? transport.close(cb) : cb()
        let srv_ws = this._interface.ws
        if (!srv_ws) return cb()

        srv_ws.close()

        // Under the hood it creates a httpServer instance then doesn't clean it up
        srv_ws.httpServer.close()
        cb()
      },
      (cb) => {
        let srv_http = this._interface.http
        if (!srv_http) return cb()

        srv_http.close()
        cb()
      }
    ], (err) => {
      delete this.node
      delete this._interface.ws
      delete this._interface.http

      this._active = false

      cb(err)
    })
  }
}

module.exports = Grape
