/* eslint-env mocha */

'use strict'

const { test } = require('tap')
const { when, once } = require('nonsynchronous')
const { sampleSize } = require('lodash')
const {
  createGrapes,
  createTwoGrapes
} = require('./helper.js')

test('service announce/lookup', async () => {
  test('lookup non-existent key', { timeout: 5000 }, async ({ error, strictSame }) => {
    const { grape1, stop } = await createTwoGrapes()

    const until = when()

    grape1.lookup('rest:util:net', (err, res) => {
      error(err)
      strictSame(res, [])
      until()
    })

    await until.done()
    await stop()
  })

  test('should find services', { timeout: 5000 }, async ({ error, strictSame }) => {
    const { grape1, grape2, stop } = await createTwoGrapes()

    grape1.announce('rest:util:net', 1337, () => {})

    await once(grape2, 'announce')

    const until = when()

    grape2.lookup('rest:util:net', (err, res) => {
      error(err)
      strictSame(res, ['127.0.0.1:1337'])
      until()
    })

    await until.done()
    await stop()
  })

  test('should remove outdated services', { timeout: 5000 }, async ({ error, strictSame }) => {
    const { grape1, grape2, stop } = await createTwoGrapes()

    grape1.announce('rest:util:net', 1337, () => {})

    await once(grape2, 'announce')

    const until = when()

    grape2.lookup('rest:util:net', (err, res) => {
      error(err)
      strictSame(res, ['127.0.0.1:1337'])
      setTimeout(lookup, 300) // 300 because maxAge is at 200 in helper
    })

    function lookup () {
      grape2.lookup('rest:util:net', (err, res) => {
        error(err)
        strictSame(res, [])
        until()
      })
    }

    await until.done()
    await stop()
  })

  test('should not cache dead peers when doing lookups', async ({ ok, strictSame }) => {
    let lookups = 0
    const { grape1, grape2, stop } = await createTwoGrapes()

    const until = when()
    grape1.announce('test', 1337, () => {
      loop()

      function loop () {
        lookup((a, b) => {
          if (!a && !b) {
            ok(lookups > 10, 'lookups greater than 10')
            until()
            return
          }
          lookups++
          if (a) strictSame(a, '127.0.0.1:1337')
          if (b) strictSame(b, '127.0.0.1:1337')
          setTimeout(loop, 10)
        })
      }
    })

    function lookup (cb) {
      grape1.lookup('test', (_, a) => {
        grape2.lookup('test', (_, b) => {
          cb(a[0], b[0])
        })
      })
    }

    await until.done()
    await stop()
  })

  test('should not cache dead peers when another one is announcing', async ({ ok }) => {
    let lookups = 0
    const { grape1, grape2, stop } = await createTwoGrapes()

    const one = startAnnouncing(grape1, 'test', 2000)
    const two = startAnnouncing(grape2, 'test', 2001)
    const until = when()
    grape1.announce('test', 1337, () => {
      setTimeout(loop, 100)
      const dead = '127.0.0.1:1337'

      function loop () {
        lookup((a, b) => {
          if (!a.includes(dead) && !b.includes(dead)) {
            clearInterval(one)
            clearInterval(two)
            ok(lookups > 5)
            until()
            return
          }
          lookups++
          ok(a.includes('127.0.0.1:2000'))
          ok(b.includes('127.0.0.1:2000'))
          ok(a.includes('127.0.0.1:2001'))
          ok(b.includes('127.0.0.1:2001'))
          setTimeout(loop, 10)
        })
      }
    })

    function lookup (onlookup) {
      grape1.lookup('test', (_, a) => {
        grape2.lookup('test', (_, b) => {
          onlookup(a, b)
        })
      })
    }

    await until.done()
    await stop()
  })

  test('should announce a simple service to lots of grapes', { timeout: 20000 }, async ({ error, strictSame }) => {
    const until = when()
    await createGrapes(100, (grapes, stop) => {
      const sample = sampleSize(grapes, 3)
      sample[0].announce('B', 2000, (err) => {
        error(err)
        sample[1].lookup('B', (err, l) => {
          error(err)
          strictSame(l, ['127.0.0.1:2000'])
          sample[2].lookup('B', (err, l) => {
            error(err)
            strictSame(l, ['127.0.0.1:2000'])
            stop(until)
          })
        })
      })
    })
    await until.done()
  })

  test('should work when services die and come back', { timeout: 20000 }, async ({ strictSame, error }) => {
    const until = when()
    await createGrapes(4, (grapes, stop) => {
      const [g0, g1, g2, g3] = sampleSize(grapes, 4)
      const one = startAnnouncing(g0, 'A', 3000)
      let two

      g1.announce('B', 2000, (err) => {
        error(err)
        setTimeout(run, 100)
        let ticks = 0

        function run () {
          ticks++
          if (ticks === 1) {
            lookup((g2l, g3l) => {
              strictSame(g2l.A, ['127.0.0.1:3000'])
              strictSame(g3l.A, ['127.0.0.1:3000'])
              strictSame(g2l.B, ['127.0.0.1:2000'])
              strictSame(g3l.B, ['127.0.0.1:2000'])
              setTimeout(run, 100)
            })
            return
          }
          if (ticks === 6) {
            lookup((g2l, g3l) => {
              strictSame(g2l.A, ['127.0.0.1:3000'])
              strictSame(g3l.A, ['127.0.0.1:3000'])
              strictSame(g2l.B, [])
              strictSame(g3l.B, [])
              two = startAnnouncing(g1, 'B', 2000)
              setTimeout(run, 100)
            })
            return
          }
          if (ticks === 20) {
            lookup((g2l, g3l) => {
              strictSame(g2l.A, ['127.0.0.1:3000'])
              strictSame(g3l.A, ['127.0.0.1:3000'])
              strictSame(g2l.B, ['127.0.0.1:2000'])
              strictSame(g3l.B, ['127.0.0.1:2000'])
              clearInterval(one)
              clearInterval(two)
              setTimeout(() => {
                stop(until)
              }, 100)
            })
            return
          }
          setTimeout(run, 100)
        }
      })

      function lookup (onlookup) {
        let missing = 4
        const res = [{}, {}]

        get(g2, 'A')
        get(g2, 'B')
        get(g3, 'A')
        get(g3, 'B')

        function get (grape, name) {
          grape.lookup(name, (_, l) => {
            res[grape === g2 ? 0 : 1][name] = l
            if (!--missing) onlookup(res[0], res[1])
          })
        }
      }
    })
    await until.done()
  })

  test('should work when services die and come back (lots of grapes)', { timeout: 20000 }, async ({ error, strictSame }) => {
    const until = when()
    await createGrapes(40, (grapes, stop) => {
      const [g0, g1, g2, g3] = sampleSize(grapes, 4)
      const one = startAnnouncing(g0, 'A', 3000)
      let two

      g1.announce('B', 2000, (err) => {
        error(err)
        setTimeout(run, 100)
        let ticks = 0

        function run () {
          ticks++
          if (ticks === 1) {
            lookup((g2l, g3l) => {
              strictSame(g2l.A, ['127.0.0.1:3000'])
              strictSame(g3l.A, ['127.0.0.1:3000'])
              strictSame(g2l.B, ['127.0.0.1:2000'])
              strictSame(g3l.B, ['127.0.0.1:2000'])
              setTimeout(run, 100)
            })
            return
          }
          if (ticks === 6) {
            lookup((g2l, g3l) => {
              strictSame(g2l.A, ['127.0.0.1:3000'])
              strictSame(g3l.A, ['127.0.0.1:3000'])
              strictSame(g2l.B, [])
              strictSame(g3l.B, [])
              two = startAnnouncing(g1, 'B', 2000)
              setTimeout(run, 100)
            })
            return
          }
          if (ticks === 20) {
            lookup((g2l, g3l) => {
              strictSame(g2l.A, ['127.0.0.1:3000'])
              strictSame(g3l.A, ['127.0.0.1:3000'])
              strictSame(g2l.B, ['127.0.0.1:2000'])
              strictSame(g3l.B, ['127.0.0.1:2000'])
              clearInterval(one)
              clearInterval(two)
              setTimeout(() => {
                stop(until)
              }, 100)
            })
            return
          }
          setTimeout(run, 100)
        }
      })

      function lookup (onlookup) {
        let missing = 4
        const res = [{}, {}]

        get(g2, 'A')
        get(g2, 'B')
        get(g3, 'A')
        get(g3, 'B')

        function get (grape, name) {
          grape.lookup(name, (_, l) => {
            res[grape === g2 ? 0 : 1][name] = l
            if (!--missing) onlookup(res[0], res[1])
          })
        }
      }
    })
    await until.done()
  })

  test('announce own port', { timeout: 5000 }, async ({ error, strictSame }) => {
    const { grape1, grape2, stop } = await createTwoGrapes()

    const until = when()

    grape1.announce('rest:util:net', (err) => {
      error(err)
      grape2.lookup('rest:util:net', (err, res) => {
        error(err)
        strictSame(res, [`127.0.0.1:${grape1.conf.dht_port}`])
        until()
      })
    })

    await until.done()
    await stop()
  })

  test('announce own port – fire and forget', { timeout: 5000 }, async ({ error, strictSame }) => {
    const { grape1, grape2, stop } = await createTwoGrapes()

    const until = when()

    grape1.announce('rest:util:net')
    await once(grape2, 'announce')

    grape2.lookup('rest:util:net', (err, res) => {
      error(err)
      strictSame(res, [`127.0.0.1:${grape1.conf.dht_port}`])
      until()
    })

    await until.done()
    await stop()
  })

  test('invalid port', async ({ is }) => {
    const { grape1, stop } = await createTwoGrapes()
    const until = when()
    grape1.announce('rest:util:net', '1337', (err) => {
      is(!!err, true)
      is(err.message, 'ERR_GRAPE_SERVICE_PORT')
      until()
    })

    await until.done()
    await stop()
  })
})

function startAnnouncing (grape, name, port) {
  const ivl = setInterval(_ => grape.announce(name, port), 20)
  ivl.unref()
  return ivl
}
