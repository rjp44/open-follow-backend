const supertest = require("supertest");
const server = require("../server");


test("Server returns hello world", () => {
  return supertest(server).get("/").expect(200, {
    message: "Hello world",
  });
});

test("Server returns error for missing route", () => {
  return supertest(server).get("/NOT-REAL").expect(404, {
    error: "Not Found",
    info: "Path '/NOT-REAL' does not exist",
  });
});