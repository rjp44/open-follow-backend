const config = require('config');
const server = require("./server.js");
const { exec } = require("child_process");
const PORT = config.get('port');


server.listen(PORT, () => console.info(`Listening on localhost:${PORT}, pulling directory from ${config.get('directory_host')}`));


