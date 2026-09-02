const vm = require("node:vm");
const { getClientSource } = require("./helpers/load-app-source");

new vm.Script(getClientSource(), {
  filename: "apps-script/JavaScript.html"
});

console.log("Client JavaScript syntax OK");
