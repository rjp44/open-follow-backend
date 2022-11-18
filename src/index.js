const config = require('config');
const server = require("./server.js");
const { exec } = require("child_process");

const PORT = config.get('port');


console.log(config.get('storage.url'));
exec("ls -la credentials", (error, stdout, stderr) => {
  if (error) {
    console.log(`error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.log(`stderr: ${stderr}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
});

server.listen(PORT, () => console.info(`Listening on http://localhost:${PORT}`));

process.on("unhandledRejection", (error) => {
  console.error(error);
  process.exit(1);
});
