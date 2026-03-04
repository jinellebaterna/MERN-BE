const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/mern-project").then(async () => {
  const result = await mongoose.connection.collection("places").updateMany(
    { image: { $exists: true }, images: { $exists: false } },
    [{ $set: { images: ["$image"] } }]
  );
  console.log(`Migrated ${result.modifiedCount} documents`);
  mongoose.disconnect();
});
