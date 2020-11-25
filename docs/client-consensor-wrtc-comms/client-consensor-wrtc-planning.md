# Client Consensor WRTC Communication

## Initial planning

Archiver

  Needs to host a peer-js server
  Needs to include peerIds of consensors in nodelist 

Consensor (shardus-global-server)

  Connects to peer-js server hosted by Archiver and listens for connections
  Needs to pass its peerId to Archiver (possibly include in join request?)

Client (liberdus-web-client)

  Connects to peer-js server hosted by Archiver
  Connects to consensors using their peerIds
  Passes txs to consensors through peer connection

## Data Model

### Summary
**This document explains the list of changes and data flow between archiver-server, global-server and liberdus-web-client when using peer-js (WRTC) connection instead of HTTP.**

### archive-server

Archive server needs to host a peer server to exchange connections from peers.

*NodeInfo data should include peerId:*

```ts
export interface FirstNodeInfo {
  nodeInfo: {
    externalIp: string
    externalPort: number
    publicKey: string
    peerId: string
  }
}
```

*Start a peer-server at port 6000*

```ts
const { PeerServer } = require('peer')
const peerServer = PeerServer({
  port: peerPort,
  key: 'liberdus',
  path: '/liberdus-peer'
})

peerServer.on('connection', client => {
  console.log(client)
})

peerServer.on('disconnect', client => {
  console.log(client)
})
```
*To be confirmed: archive-server may need to setup SSL certificate to serve as a peer-server. Web-client may query archive-server to get a list of peerIds of active Nodes in the network.*

### shardus-global-server

*p2p/Self.ts, update getThisNodeInfo() function to include peerId field.*

```ts
export function getThisNodeInfo() {
  ...
  const nodeInfo = {
    publicKey,
    externalIp,
    externalPort,
    internalIp,
    internalPort,
    peerId,
    address,
    joinRequestTimestamp,
    activeTimestamp,
  }
  return nodeInfo
}
```

*network/index.ts, update \_setupExternal() function to connect to peer server and get a peer Id which will be used in join request.*

```ts
const fetch = require('node-fetch')
const WebSocket = require('ws')
const Peer = require('simple-peer')
const wrtc = require('wrtc')
const SimplePeerJs = require('simple-peerjs')

const initiator = new SimplePeerJs({
  fetch,
  WebSocket,
  wrtc,
  key: 'liberdus',
  host: archiver.ip,
  port: archiver.peerPort,
  secure: true,
  path: '/liberdus-peer'
})
const peerId = await initiator.id
if (peerId) Self.peerId = peerId

initiator.on('connect', clientConnection => {
  console.log('A web-client connected:', clientConnection.peerId)

  // process an injected transaction from web-client
  clientConnection.peer.on('data', data => {
    if (data.url === 'inject' && data.method === 'POST') {
      shardus.put(data.body)
    }
  })

  // respond to data request from web-clients
  clientConnection.peer.on('data', data => {
    if (data.url === 'account/id' && data.method === 'GET') {
      let accountData = shardus.getLocalOrRemoteAccount(data.body.id)
      clientConnection.peer.send(
        JSON.stringify({
          type: 'account',
          method: 'GET',
          body: {
            id: 'abc123'
          },
          sender: ourPeerId
        })
      )
    }
  })
})
```

### liberdus-web-client

*Web client connects to peer-server hosted on archive-server*

```ts
const initiator = new SimplePeerJs({
  key: 'liberdus',
  host: archiver.ip,
  port: archiver.peerPort,
  secure: true,
  path: '/liberdus-peer'
})

// get own peer id
const ourPeerId = await initiator.id

// get a peer Id of a random consensor node
const consensorPeerId = await getRandomPeerIdFromArchiver()
```

*Connect to a random consensor consensor node*
```ts
// connect to a consensor node
const peerConnection = await initiator.connect(consensorPeerId)

// inject a new tx to consensor node
peerConnection.peer.send(
  JSON.stringify({
    url: 'inject',
    method: 'POST',
    body: tx,
    sender: ourPeerId
  })
)

// query account data from consensor node
peerConnection.peer.send(
  JSON.stringify({
    url: 'account/id',
    method: 'GET',
    body: {
      id: 'abc123'
    },
    sender: ourPeerId
  })
)

// process data when consensor respond with account data
initiatorConnection.peer.on('data', data => {
  if (data.type === 'account') {
    await processAccountData(data)
  }
})
```
