const StateManager = require('../../../src/state-manager')
const ShardFunctions = require('../../../src/state-manager/shardFunctions.js')

const crypto = require('shardus-crypto-utils')
const utils = require('../../../src/utils')

// let ourSolutionStr = '{"hash":"904c4fdcad533bc8518d4f3b7166788d115912f8bbf47e7e03f3a60b76dd9639","votePower":1,"hashSet":"bce78b623ccc51303a0d67e67d85d215430831bdf0b1f113651c2790b1ad157dc78a0f9b4ea426f8262560077023e3b37d3c8e9c6a60fb56700bc3773ea5a3d527f50e2990f61e1cbc727c7b20586e0e2830356b4a91954f7485034112681f7b4bf9289b8ecf2f17658663a1f8c68e068d60176888fbac7753d9f38f966d7a47d25412b5672b56ab","lastValue":"0341","errorStack":[],"corrections":[{"i":19,"tv":{"v":"97d9","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"97d9","t":"insert","bv":"26f8","if":19},{"i":26,"tv":{"v":"8e35","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"8e35","t":"insert","bv":"8e9c","if":26},{"i":26,"t":"extra","c":{"i":27,"tv":{"v":"6a60","count":1004,"vote":{"count":1004,"ec":1,"voters":[0,1,3,4]}},"v":"6a60","t":"insert","bv":"8e9c","if":27},"hi":25,"tv":null,"v":null,"bv":null,"if":-1},{"i":33,"tv":{"v":"27bc","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"27bc","t":"insert","bv":"27f5","if":33},{"i":33,"t":"extra","c":{"i":34,"tv":{"v":"0e29","count":1004,"vote":{"count":1004,"ec":1,"voters":[0,1,3,4]}},"v":"0e29","t":"insert","bv":"27f5","if":34},"hi":32,"tv":null,"v":null,"bv":null,"if":-1},{"i":39,"t":"extra","c":{"i":40,"tv":{"v":"2830","count":1004,"vote":{"count":1004,"ec":1,"voters":[0,1,3,4]}},"v":"2830","t":"insert","bv":"2058","if":40},"hi":39,"tv":null,"v":null,"bv":null,"if":-1},{"i":38,"t":"extra","c":{"i":39,"tv":{"v":"6e48","count":1002,"vote":{"count":1002,"ec":2,"voters":[0,3,4]}},"v":"6e48","t":"insert","bv":"2058","if":39},"hi":38,"tv":null,"v":null,"bv":null,"if":-1},{"i":45,"t":"extra","c":null,"hi":45,"tv":null,"v":null,"bv":null,"if":-1},{"i":46,"t":"extra","c":null,"hi":46,"tv":null,"v":null,"bv":null,"if":-1},{"i":47,"t":"extra","c":null,"hi":47,"tv":null,"v":null,"bv":null,"if":-1},{"i":48,"t":"extra","c":null,"hi":48,"tv":null,"v":null,"bv":null,"if":-1},{"i":49,"t":"extra","c":null,"hi":49,"tv":null,"v":null,"bv":null,"if":-1},{"i":50,"t":"extra","c":null,"hi":50,"tv":null,"v":null,"bv":null,"if":-1},{"i":51,"t":"extra","c":null,"hi":51,"tv":null,"v":null,"bv":null,"if":-1},{"i":52,"t":"extra","c":null,"hi":52,"tv":null,"v":null,"bv":null,"if":-1},{"i":53,"t":"extra","c":null,"hi":53,"tv":null,"v":null,"bv":null,"if":-1},{"i":54,"t":"extra","c":null,"hi":54,"tv":null,"v":null,"bv":null,"if":-1},{"i":55,"t":"extra","c":null,"hi":55,"tv":null,"v":null,"bv":null,"if":-1},{"i":56,"t":"extra","c":null,"hi":56,"tv":null,"v":null,"bv":null,"if":-1},{"i":57,"t":"extra","c":null,"hi":57,"tv":null,"v":null,"bv":null,"if":-1},{"i":58,"t":"extra","c":null,"hi":58,"tv":null,"v":null,"bv":null,"if":-1},{"i":59,"t":"extra","c":null,"hi":59,"tv":null,"v":null,"bv":null,"if":-1},{"i":60,"t":"extra","c":null,"hi":60,"tv":null,"v":null,"bv":null,"if":-1},{"i":61,"t":"extra","c":null,"hi":61,"tv":null,"v":null,"bv":null,"if":-1},{"i":62,"t":"extra","c":null,"hi":62,"tv":null,"v":null,"bv":null,"if":-1},{"i":63,"t":"extra","c":null,"hi":63,"tv":null,"v":null,"bv":null,"if":-1},{"i":64,"t":"extra","c":null,"hi":64,"tv":null,"v":null,"bv":null,"if":-1},{"i":65,"t":"extra","c":null,"hi":65,"tv":null,"v":null,"bv":null,"if":-1},{"i":66,"t":"extra","c":null,"hi":66,"tv":null,"v":null,"bv":null,"if":-1},{"i":67,"t":"extra","c":null,"hi":67,"tv":null,"v":null,"bv":null,"if":-1}],"indexOffset":0,"owners":["af5a8e324b00a620bdb12ed5a393c903691febacdd285fb9b91c7b65f92a9a96"],"ourRow":true,"waitForIndex":-1,"futureIndex":40,"futureValue":"2830","waitedForThis":false,"indexMap":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,-1,19,20,21,22,23,24,-1,26,27,28,29,30,31,-1,33,34,35,36,37,40,41,42,43,44,45],"extraMap":[25,32,39,38,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67]}'

// let ourSolutionStr = '{"hash":"710bcfd34f8c2eafbcafe925023e23b505b0b897c5eddb3889f91728a901753b","votePower":1,"hashSet":"42820f89ab785b9cafa6aa43cf6eaa30135d2ca819f7535dc8519c6098f35a2daba0e5ff7a9c84497286511e2379d61d8355070374805a905e9e940d7facaae4f18a0fad766d51c5c84132055ad78ebdb77a377418d4a225b12fd01f10cad019331a3805e29415414ef0a01ac0a8229de7f04a8c8d717d137420a104f26fd66f3e5c27fe9fecd87c2fb3a996b9a8dd368d7a58f6da0d70680d54988789f3541d725f3944b63a38d4c3c5d9183b7615db23b23d8fb8ae73414b126b6345dedf9bb6bf4bc6ea5ac8f55bbfe3e638d04429d5ca9ec7e7b27ca206f18bda1528aabafbf855a3dfb8b2a7fd202ef3a5d72d8c97f21d05e995ab92f7ff8aba59b4788079a649ba001b1310a78f0986b1ae1111035f62a9c96b2d70f210861c44f97ecc350ae6d50b75849a5174107376c2602c625b53d62992df750c5c1f21","lastValue":"1f21","errorStack":[],"corrections":[{"i":82,"tv":{"v":"5987","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"5987","t":"insert","bv":"b63a","if":82},{"i":90,"tv":{"v":"3d0a","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"3d0a","t":"insert","bv":"3d8f","if":90},{"i":90,"t":"extra","c":{"i":91,"tv":{"v":"b8ae","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"b8ae","t":"insert","bv":"3d8f","if":91},"hi":89,"tv":null,"v":null,"bv":null,"if":-1},{"i":98,"tv":{"v":"4b27","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"4b27","t":"insert","bv":"4bc6","if":98},{"i":98,"t":"extra","c":{"i":99,"tv":{"v":"ea5a","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"ea5a","t":"insert","bv":"4bc6","if":99},"hi":97,"tv":null,"v":null,"bv":null,"if":-1},{"i":106,"tv":{"v":"9eb3","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,3,4]}},"v":"9eb3","t":"insert","bv":"9ec7","if":106},{"i":106,"t":"extra","c":{"i":107,"tv":{"v":"e7b2","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"e7b2","t":"insert","bv":"9ec7","if":107},"hi":105,"tv":null,"v":null,"bv":null,"if":-1},{"i":114,"tv":{"v":"5598","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"5598","t":"insert","bv":"55a3","if":114},{"i":114,"t":"extra","c":{"i":115,"tv":{"v":"dfb8","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"dfb8","t":"insert","bv":"55a3","if":115},"hi":113,"tv":null,"v":null,"bv":null,"if":-1},{"i":122,"tv":{"v":"1ded","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"1ded","t":"insert","bv":"1d05","if":122},{"i":122,"t":"extra","c":{"i":123,"tv":{"v":"e995","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"e995","t":"insert","bv":"1d05","if":123},"hi":121,"tv":null,"v":null,"bv":null,"if":-1},{"i":130,"tv":{"v":"495a","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"495a","t":"insert","bv":"49ba","if":130},{"i":130,"t":"extra","c":{"i":131,"tv":{"v":"001b","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"001b","t":"insert","bv":"49ba","if":131},"hi":129,"tv":null,"v":null,"bv":null,"if":-1},{"i":138,"tv":{"v":"62ca","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"62ca","t":"insert","bv":"62a9","if":138},{"i":138,"t":"extra","c":{"i":139,"tv":{"v":"c96b","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"c96b","t":"insert","bv":"62a9","if":139},"hi":137,"tv":null,"v":null,"bv":null,"if":-1},{"i":145,"tv":{"v":"3528","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"3528","t":"insert","bv":"350a","if":145},{"i":145,"t":"extra","c":{"i":146,"tv":{"v":"e6d5","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"e6d5","t":"insert","bv":"350a","if":146},"hi":144,"tv":null,"v":null,"bv":null,"if":-1},{"i":153,"tv":{"v":"62a3","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"62a3","t":"insert","bv":"625b","if":153},{"i":153,"t":"extra","c":{"i":154,"tv":{"v":"53d6","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,3,4]}},"v":"53d6","t":"insert","bv":"625b","if":154},"hi":152,"tv":null,"v":null,"bv":null,"if":-1}],"indexOffset":-1,"owners":["78cef25b495227e4b0f82548ea4bb39e43b57c0f78003fa14b9715c9d2407e20"],"ourRow":true,"waitForIndex":-1,"futureIndex":153,"futureValue":"53d6","waitedForThis":false,"indexMap":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,-1,82,83,84,85,86,87,88,-1,90,91,92,93,94,95,96,-1,98,99,100,101,102,103,104,-1,106,107,108,109,110,111,112,-1,114,115,116,117,118,119,120,-1,122,123,124,125,126,127,128,-1,130,131,132,133,134,135,136,-1,138,139,140,141,142,143,-1,145,146,147,148,149,150,151,-1,153,154,155,156,157],"extraMap":[89,97,105,113,121,129,137,144,152]}'
// let ourSolutionStr = '{"hash":"dfeb2807a2102aaf971d91f6748c1da3973f902f6ad87221c271eb78c7b2a8c4","votePower":1,"hashSet":"2e5eaf523be3d6012dc83cc5f6cede4ee19d778ccd1fb3b82e0c25cf3a1512e92cbb5428a68f291f32c534f2b78583671f29fabf89181b962ecf2b73ed0b9ce05b1e7fdb1df016d87686fab3dd5af6c61be6431f99a8f5d1ff7834ddb03cb562352a7a85893f3c3618e3c189799cccef6b00c21d2a86166a5236760367b5e2f76b1a68beeb2e66f7807ea6ce31b139e7ccf1fb5e6f20776328258d208bf94650d5cfbb7b0c2762f19129b789a7c9165bd652a2c894ad15de085c8eac0632a5847af94be2fd2627b8bac515bd4ab063bc6fd06bf761d0b20e99bc0789b4ac44e22b055276a4396ded129faf981848ba097f0ef4be9c295dad37332fda87b8f190513f7ae0d73a18264e6772df96028ed20b4916a13eba95921f361d16d2d73c4d15a8c72fb9c3bed27e716b7d7e0a1b86d2ff37f6b38e8c91aa59b5b122885cac203f9418aff8a44a4576edcaeea97fb2d17e870c011d65081c366dd16506","lastValue":"d17e","errorStack":[],"corrections":[{"i":84,"tv":{"v":"eb67","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"eb67","t":"insert","bv":"9129","if":84},{"i":93,"tv":{"v":"0874","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"0874","t":"insert","bv":"085c","if":93},{"i":93,"t":"extra","c":{"i":94,"tv":{"v":"8eac","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"8eac","t":"insert","bv":"085c","if":94},"hi":92,"tv":null,"v":null,"bv":null,"if":-1},{"i":98,"tv":{"v":"43f7","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"43f7","t":"insert","bv":"4be2","if":98},{"i":102,"tv":{"v":"ba29","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"ba29","t":"insert","bv":"bac5","if":102},{"i":102,"t":"extra","c":{"i":103,"tv":{"v":"15bd","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"15bd","t":"insert","bv":"bac5","if":103},"hi":100,"tv":null,"v":null,"bv":null,"if":-1},{"i":107,"tv":{"v":"6b2a","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"6b2a","t":"insert","bv":"6bf7","if":107},{"i":107,"t":"extra","c":{"i":108,"tv":{"v":"61d0","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"61d0","t":"insert","bv":"6bf7","if":108},"hi":105,"tv":null,"v":null,"bv":null,"if":-1},{"i":111,"tv":{"v":"07ce","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"07ce","t":"insert","bv":"0789","if":111},{"i":111,"t":"extra","c":{"i":112,"tv":{"v":"b4ac","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"b4ac","t":"insert","bv":"0789","if":112},"hi":109,"tv":null,"v":null,"bv":null,"if":-1},{"i":115,"tv":{"v":"b7cf","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"b7cf","t":"insert","bv":"5276","if":115},{"i":116,"tv":{"v":"52f9","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"52f9","t":"insert","bv":"5276","if":116},{"i":116,"t":"extra","c":{"i":117,"tv":{"v":"a439","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"a439","t":"insert","bv":"5276","if":117},"hi":113,"tv":null,"v":null,"bv":null,"if":-1},{"i":120,"tv":{"v":"afe5","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"afe5","t":"insert","bv":"af98","if":120},{"i":120,"t":"extra","c":{"i":121,"tv":{"v":"1848","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"1848","t":"insert","bv":"af98","if":121},"hi":117,"tv":null,"v":null,"bv":null,"if":-1},{"i":124,"tv":{"v":"f48d","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"f48d","t":"insert","bv":"f4be","if":124},{"i":124,"t":"extra","c":{"i":125,"tv":{"v":"9c29","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"9c29","t":"insert","bv":"f4be","if":125},"hi":121,"tv":null,"v":null,"bv":null,"if":-1},{"i":128,"tv":{"v":"2f9a","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"2f9a","t":"insert","bv":"2fda","if":128},{"i":128,"t":"extra","c":{"i":129,"tv":{"v":"87b8","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"87b8","t":"insert","bv":"2fda","if":129},"hi":125,"tv":null,"v":null,"bv":null,"if":-1},{"i":132,"tv":{"v":"7a2c","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"7a2c","t":"insert","bv":"7ae0","if":132},{"i":133,"t":"extra","c":{"i":134,"tv":{"v":"1826","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"1826","t":"insert","bv":"7ae0","if":134},"hi":130,"tv":null,"v":null,"bv":null,"if":-1},{"i":132,"t":"extra","c":{"i":133,"tv":{"v":"d7f6","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"d7f6","t":"insert","bv":"7ae0","if":133},"hi":129,"tv":null,"v":null,"bv":null,"if":-1},{"i":137,"tv":{"v":"96de","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"96de","t":"insert","bv":"9602","if":137},{"i":137,"t":"extra","c":{"i":138,"tv":{"v":"8ed2","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4,5]}},"v":"8ed2","t":"insert","bv":"9602","if":138},"hi":134,"tv":null,"v":null,"bv":null,"if":-1},{"i":140,"tv":{"v":"169d","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"169d","t":"insert","bv":"16a1","if":140},{"i":141,"t":"extra","c":{"i":142,"tv":{"v":"9592","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"9592","t":"insert","bv":"16a1","if":142},"hi":138,"tv":null,"v":null,"bv":null,"if":-1},{"i":140,"t":"extra","c":{"i":141,"tv":{"v":"3ec7","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"3ec7","t":"insert","bv":"16a1","if":141},"hi":137,"tv":null,"v":null,"bv":null,"if":-1},{"i":145,"tv":{"v":"d28c","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"d28c","t":"insert","bv":"d2d7","if":145},{"i":145,"t":"extra","c":{"i":146,"tv":{"v":"3c4d","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"3c4d","t":"insert","bv":"d2d7","if":146},"hi":142,"tv":null,"v":null,"bv":null,"if":-1},{"i":149,"tv":{"v":"b948","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"b948","t":"insert","bv":"b9c3","if":149},{"i":150,"t":"extra","c":{"i":151,"tv":{"v":"7e71","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"7e71","t":"insert","bv":"b9c3","if":151},"hi":147,"tv":null,"v":null,"bv":null,"if":-1},{"i":149,"t":"extra","c":{"i":150,"tv":{"v":"be1b","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"be1b","t":"insert","bv":"b9c3","if":150},"hi":146,"tv":null,"v":null,"bv":null,"if":-1},{"i":154,"tv":{"v":"1b23","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"1b23","t":"insert","bv":"1b86","if":154},{"i":154,"t":"extra","c":{"i":155,"tv":{"v":"d2ff","count":1003,"vote":{"count":1003,"ec":1,"voters":[1,2,4,5]}},"v":"d2ff","t":"insert","bv":"1b86","if":155},"hi":151,"tv":null,"v":null,"bv":null,"if":-1},{"i":158,"tv":{"v":"8c78","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"8c78","t":"insert","bv":"8c91","if":158},{"i":159,"t":"extra","c":{"i":160,"tv":{"v":"b5b1","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"b5b1","t":"insert","bv":"8c91","if":160},"hi":156,"tv":null,"v":null,"bv":null,"if":-1},{"i":158,"t":"extra","c":{"i":159,"tv":{"v":"aa34","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"aa34","t":"insert","bv":"8c91","if":159},"hi":155,"tv":null,"v":null,"bv":null,"if":-1},{"i":161,"t":"extra","c":{"i":162,"tv":{"v":"203f","count":1001,"vote":{"count":1001,"ec":4,"voters":[2,5]}},"v":"203f","t":"insert","bv":"5cac","if":162},"hi":159,"tv":null,"v":null,"bv":null,"if":-1},{"i":166,"tv":{"v":"4555","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"4555","t":"insert","bv":"4576","if":166},{"i":167,"t":"extra","c":{"i":168,"tv":{"v":"eea9","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,1,4,5]}},"v":"eea9","t":"insert","bv":"4576","if":168},"hi":165,"tv":null,"v":null,"bv":null,"if":-1},{"i":166,"t":"extra","c":{"i":167,"tv":{"v":"ed8a","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,1,2,4,5]}},"v":"ed8a","t":"insert","bv":"4576","if":167},"hi":164,"tv":null,"v":null,"bv":null,"if":-1},{"i":170,"t":"extra","c":null,"hi":168,"tv":null,"v":null,"bv":null,"if":-1},{"i":171,"t":"extra","c":null,"hi":169,"tv":null,"v":null,"bv":null,"if":-1},{"i":172,"t":"extra","c":null,"hi":170,"tv":null,"v":null,"bv":null,"if":-1},{"i":173,"t":"extra","c":null,"hi":171,"tv":null,"v":null,"bv":null,"if":-1},{"i":174,"t":"extra","c":null,"hi":172,"tv":null,"v":null,"bv":null,"if":-1},{"i":175,"t":"extra","c":null,"hi":173,"tv":null,"v":null,"bv":null,"if":-1},{"i":176,"t":"extra","c":null,"hi":174,"tv":null,"v":null,"bv":null,"if":-1}],"indexOffset":-2,"owners":["78cef25b495227e4b0f82548ea4bb39e43b57c0f78003fa14b9715c9d2407e20"],"ourRow":true,"waitForIndex":-1,"futureIndex":166,"futureValue":"eea9","waitedForThis":false,"indexMap":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,-1,84,85,86,87,88,89,90,91,-1,93,94,95,96,-1,97,98,99,-1,101,102,103,104,-1,106,107,108,-1,110,111,112,-1,-1,114,115,116,-1,118,119,120,-1,122,123,124,-1,126,127,128,-1,131,132,133,134,-1,136,137,-1,140,141,142,143,-1,145,146,147,-1,150,151,152,153,-1,155,156,157,-1,161,162,163,164,165,166,167,-1,170,171,172],"extraMap":[92,100,105,109,113,117,121,125,130,129,134,138,137,142,147,146,151,156,155,159,165,164,168,169,170,171,172,173,174]}'
let ourSolutionStr = '{"hash":"24964eb748f4803e0d3ee099812e6783aa6c0a883655facf8511585fa4b0494d","votePower":1,"hashSet":"9564f8e2f55235e3e8691b4c68d3ab8cd3c28aaf5a0d214861f87103567713159eae642b05028cba30a31abd98719177e6713bcaa2c3656aadf7559bf436645e1c1350655f04e9cdf1f16be12843c24d75c3ed4bd0956b9bc31598ab4400212526118095","lastValue":"d095","errorStack":[{"i":45,"tv":{"v":"d074","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"d074"},{"i":46,"tv":{"v":"6b49","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"6b49"}],"corrections":[{"i":5,"tv":{"v":"734f","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"734f","t":"insert","bv":"1b4c","if":5},{"i":6,"tv":{"v":"6d25","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"6d25","t":"insert","bv":"1b4c","if":6},{"i":11,"tv":{"v":"8aac","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"8aac","t":"insert","bv":"8aaf","if":11},{"i":12,"t":"extra","c":{"i":13,"tv":{"v":"2148","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"2148","t":"insert","bv":"8aaf","if":13},"hi":10,"tv":null,"v":null,"bv":null,"if":-1},{"i":11,"t":"extra","c":{"i":12,"tv":{"v":"5aa1","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"5aa1","t":"insert","bv":"8aaf","if":12},"hi":9,"tv":null,"v":null,"bv":null,"if":-1},{"i":14,"tv":{"v":"19d6","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"19d6","t":"insert","bv":"61f8","if":14},{"i":18,"tv":{"v":"130b","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"130b","t":"insert","bv":"1315","if":18},{"i":19,"t":"extra","c":{"i":20,"tv":{"v":"642b","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"642b","t":"insert","bv":"1315","if":20},"hi":16,"tv":null,"v":null,"bv":null,"if":-1},{"i":18,"t":"extra","c":{"i":19,"tv":{"v":"9e9b","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"9e9b","t":"insert","bv":"1315","if":19},"hi":15,"tv":null,"v":null,"bv":null,"if":-1},{"i":21,"tv":{"v":"05d2","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"05d2","t":"insert","bv":"0502","if":21},{"i":21,"t":"extra","c":{"i":22,"tv":{"v":"8cba","count":1004,"vote":{"count":1004,"ec":1,"voters":[0,2,3,4]}},"v":"8cba","t":"insert","bv":"0502","if":22},"hi":18,"tv":null,"v":null,"bv":null,"if":-1},{"i":25,"tv":{"v":"98ef","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"98ef","t":"insert","bv":"9871","if":25},{"i":26,"t":"extra","c":{"i":27,"tv":{"v":"e671","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"e671","t":"insert","bv":"9871","if":27},"hi":23,"tv":null,"v":null,"bv":null,"if":-1},{"i":25,"t":"extra","c":{"i":26,"tv":{"v":"91bc","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"91bc","t":"insert","bv":"9871","if":26},"hi":22,"tv":null,"v":null,"bv":null,"if":-1},{"i":28,"tv":{"v":"0a03","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"0a03","t":"insert","bv":"3bca","if":28},{"i":32,"tv":{"v":"ad57","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"ad57","t":"insert","bv":"adf7","if":32},{"i":33,"t":"extra","c":{"i":34,"tv":{"v":"f436","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"f436","t":"insert","bv":"adf7","if":34},"hi":29,"tv":null,"v":null,"bv":null,"if":-1},{"i":32,"t":"extra","c":{"i":33,"tv":{"v":"55da","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"55da","t":"insert","bv":"adf7","if":33},"hi":28,"tv":null,"v":null,"bv":null,"if":-1},{"i":35,"tv":{"v":"6484","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"6484","t":"insert","bv":"645e","if":35},{"i":35,"t":"extra","c":{"i":36,"tv":{"v":"1c13","count":1004,"vote":{"count":1004,"ec":1,"voters":[0,2,3,4]}},"v":"1c13","t":"insert","bv":"645e","if":36},"hi":31,"tv":null,"v":null,"bv":null,"if":-1},{"i":41,"t":"extra","c":{"i":42,"tv":{"v":"c24d","count":1004,"vote":{"count":1004,"ec":1,"voters":[0,2,3,4]}},"v":"c24d","t":"insert","bv":"e9cd","if":42},"hi":38,"tv":null,"v":null,"bv":null,"if":-1},{"i":40,"t":"extra","c":{"i":41,"tv":{"v":"28ce","count":1001,"vote":{"count":1001,"ec":3,"voters":[0,4]}},"v":"28ce","t":"insert","bv":"e9cd","if":41},"hi":37,"tv":null,"v":null,"bv":null,"if":-1},{"i":39,"t":"extra","c":{"i":40,"tv":{"v":"f1ba","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"f1ba","t":"insert","bv":"e9cd","if":40},"hi":36,"tv":null,"v":null,"bv":null,"if":-1},{"i":38,"t":"extra","c":{"i":39,"tv":{"v":"e952","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"e952","t":"insert","bv":"e9cd","if":39},"hi":35,"tv":null,"v":null,"bv":null,"if":-1},{"i":45,"tv":{"v":"d074","count":1003,"vote":{"count":1003,"ec":1,"voters":[0,2,4]}},"v":"d074","t":"insert","bv":"d095","if":45},{"i":46,"tv":{"v":"6b49","count":1004,"vote":{"count":1004,"ec":0,"voters":[0,2,3,4]}},"v":"6b49","t":"insert","bv":"d095","if":46},{"i":47,"t":"extra","c":null,"hi":42,"tv":null,"v":null,"bv":null,"if":-1},{"i":48,"t":"extra","c":null,"hi":43,"tv":null,"v":null,"bv":null,"if":-1},{"i":49,"t":"extra","c":null,"hi":44,"tv":null,"v":null,"bv":null,"if":-1},{"i":50,"t":"extra","c":null,"hi":45,"tv":null,"v":null,"bv":null,"if":-1},{"i":51,"t":"extra","c":null,"hi":46,"tv":null,"v":null,"bv":null,"if":-1},{"i":52,"t":"extra","c":null,"hi":47,"tv":null,"v":null,"bv":null,"if":-1},{"i":53,"t":"extra","c":null,"hi":48,"tv":null,"v":null,"bv":null,"if":-1},{"i":54,"t":"extra","c":null,"hi":49,"tv":null,"v":null,"bv":null,"if":-1}],"indexOffset":-5,"owners":["6186d20838be67421844cd8cba70d72c938c8221756739d7717def09bc5fdfcc"],"ourRow":true,"waitForIndex":-1,"futureIndex":39,"futureValue":"c24d","waitedForThis":false,"indexMap":[0,1,2,3,4,-1,-1,5,6,7,8,-1,11,12,-1,13,14,15,-1,18,19,-1,21,22,23,-1,26,27,-1,28,29,30,-1,33,34,-1,36,37,39,40,44,45,46,47,48,-1,-1],"extraMap":[10,9,16,15,18,23,22,29,28,31,38,37,36,35,42,43,44,45,46,47,48,49]}'
let ourSolution = JSON.parse(ourSolutionStr)

// let solvedHash = 'bce78b623ccc51303a0d67e67d85d215430831bdf0b1f113651c2790b1ad157dc78a0f9b4ea497d926f8262560077023e3b37d3c8e356a60fb56700bc3773ea5a3d527bc0e2990f61e1cbc727c7b6e482830356b4a91954f7485'
// let solvedHash = '42820f89ab785b9cafa6aa43cf6eaa30135d2ca819f7535dc8519c6098f35a2daba0e5ff7a9c84497286511e2379d61d8355070374805a905e9e940d7facaae4f18a0fad766d51c5c84132055ad78ebdb77a377418d4a225b12fd01f10cad019331a3805e29415414ef0a01ac0a8229de7f04a8c8d717d137420a104f26fd66f3e5c27fe9fecd87c2fb3a996b9a8dd368d7a58f6da0d70680d54988789f3541d725f39445987b63a38d4c3c5d9183b7615db23b23d0ab8ae73414b126b6345dedf9bb6bf4b27ea5ac8f55bbfe3e638d04429d5ca9eb3e7b27ca206f18bda1528aabafbf85598dfb8b2a7fd202ef3a5d72d8c97f21dede995ab92f7ff8aba59b4788079a6495a001b1310a78f0986b1ae1111035f62cac96b2d70f210861c44f97ecc3528e6d50b75849a5174107376c2602c62a353d62992df750c5c1f21'
// let solvedHash = '2e5eaf523be3d6012dc83cc5f6cede4ee19d778ccd1fb3b82e0c25cf3a1512e92cbb5428a68f291f32c534f2b78583671f29fabf89181b962ecf2b73ed0b9ce05b1e7fdb1df016d87686fab3dd5af6c61be6431f99a8f5d1ff7834ddb03cb562352a7a85893f3c3618e3c189799cccef6b00c21d2a86166a5236760367b5e2f76b1a68beeb2e66f7807ea6ce31b139e7ccf1fb5e6f20776328258d208bf94650d5cfbb7b0c2762f1eb679129b789a7c9165bd652a2c894ad15de08748eac0632a5847af943f74be2fd2627b8ba2915bd4ab063bc6fd06b2a61d0b20e99bc07ceb4ac44e22b05b7cf52f9a4396ded129fafe51848ba097f0ef48d9c295dad37332f9a87b8f190513f7a2cd7f618264e6772df96de8ed20b49169d3ec795921f361d16d28c3c4d15a8c72fb948be1b7e716b7d7e0a1b23d2ff37f6b38e8c78aa34b5b12288203f9418aff8a44a4555ed8aeea97fb2'
let solvedHash = '9564f8e2f55235e3e869734f6d251b4c68d3ab8cd3c28aac5aa1214819d661f871035677130b9e9b642b05d28cba30a31abd98ef91bce6710a033bcaa2c3656aad5755daf43664841c1350655f04e952f1ba28cec24d75c3ed4bd0746b49'
let solvedHashLen = solvedHash.length / 4

// let ourHashLimit = '2e5eaf523be3d6012dc83cc5f6cede4ee19d778ccd1fb3b82e0c25cf3a1512e92cbb5428a68f291f32c534f2b78583671f29fabf89181b962ecf2b73ed0b9ce05b1e7fdb1df016d87686fab3dd5af6c61be6431f99a8f5d1ff7834ddb03cb562352a7a85893f3c3618e3c189799cccef6b00c21d2a86166a5236760367b5e2f76b1a68beeb2e66f7807ea6ce31b139e7ccf1fb5e6f20776328258d208bf94650d5cfbb7b0c2762f19129b789a7c9165bd652a2c894ad15de085c8eac0632a5847af94be2fd2627b8bac515bd4ab063bc6fd06bf761d0b20e99bc0789b4ac44e22b055276a4396ded129faf981848ba097f0ef4be9c295dad37332fda87b8f190513f7ae0d73a18264e6772df96028ed20b4916a13eba95921f361d16d2d73c4d15a8c72fb9c3bed27e716b7d7e0a1b86d2ff37f6b38e8c91aa59b5b122885cac203f9418aff8a44a4576edcaeea97fb2d17e870c011d65081c366dd16506'
let ourHashLimit = '9564f8e2f55235e3e8691b4c68d3ab8cd3c28aaf5a0d214861f87103567713159eae642b05028cba30a31abd98719177e6713bcaa2c3656aadf7559bf436645e1c1350655f04e9cdf1f16be12843c24d75c3ed4bd0956b9bc31598ab4400212526118095'
let ourHashLimitLen = ourHashLimit.length / 4
console.log(` ourHashLimitLen: ${ourHashLimitLen}  solvedHashLen: ${solvedHashLen}`)

let output = new Array(solvedHashLen).fill(1, 0, solvedHashLen)
// output = output.fill(1, 0, solvedHashLen)

StateManager.expandIndexMapping(ourSolution, output)

console.log(` summary:${utils.stringifyReduce(ourSolution)}`)
