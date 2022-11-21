const config = require('config');
const server = require("./server.js");
const { exec } = require("child_process");
const PORT = config.get('port');


server.listen(PORT, () => console.info(`Listening on localhost:${PORT} with configured callback host http://${config.get('backend_host')}`));

process.on("unhandledRejection", (error) => {
  console.error(error);
  process.exit(1);
});
