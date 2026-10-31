db = db.getSiblingDB("kivodb");
db.createUser({
  user: "admin",
  pwd: "password",
  roles: [
    { role: "readWrite", db: "kivodb" },
    { role: "dbAdmin", db: "kivodb" },
  ],
});
