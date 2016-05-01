# [Grenache](https://github.com/bitfinexcom/grenache) Grape implementation

### Details
- [Project Homepage](https://github.com/bitfinexcom/grenache) 

### Setup

#### Install

```
// Install global (run binary)
npm install -g grenache-grape
```

```
// Install locally to project (programmatic approach)
npm install --save grenache-grape
```

#### Run Binary

```
// help
grape --help
````

````
// Run 3 Grapes
grape --dp 20001 --ap 30001 --bn '127.0.0.1:20002,127.0.0.1:20003'
grape --dp 20002 --ap 30002 --bn '127.0.0.1:20001,127.0.0.1:20003'
grape --dp 20003 --ap 30003 --bn '127.0.0.1:20001,127.0.0.1:20002'
```

#### Integrate in your Code

```
var Grape = require('grenache-grape').Grape

var g = new Grape({
  dht_port: 20001,
  dht_bootstrap: [
    '127.0.0.1:20002'
  ],
  api_port: 30001
})

g.start()
```

### Implementations

##### Node.JS Clients
* https://github.com/bitfinexcom/grenache-nodejs-zmq : ZeroMQ based Grape microservices
* https://github.com/bitfinexcom/grenache-nodejs-ws : WebSocket based Grape microservices

##### Ruby Clients
* https://github.com/bitfinexcom/grenache-ruby-zmq : ZeroMQ based Grape microservices
