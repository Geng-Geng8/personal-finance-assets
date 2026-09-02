const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function loadBackend() {
  const source = fs.readFileSync(
    path.join(repositoryRoot, "apps-script", "Code.js"),
    "utf8"
  );
  const context = vm.createContext({});

  vm.runInContext(source, context, {
    filename: "apps-script/Code.js"
  });

  return context;
}

function getClientSource() {
  return fs
    .readFileSync(
      path.join(repositoryRoot, "apps-script", "JavaScript.html"),
      "utf8"
    )
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");
}

function loadClient() {
  const source = getClientSource().replace(
    /\s*initializeApp\(\);\s*$/,
    ""
  );
  const context = vm.createContext({
    console,
    document: {
      getElementById() {
        return null;
      }
    }
  });

  vm.runInContext(source, context, {
    filename: "apps-script/JavaScript.html"
  });

  return context;
}

module.exports = {
  getClientSource,
  loadBackend,
  loadClient
};
