import { env } from "./env.js";
import app from "./app.js";

app.listen(env.PORT, () => {
  console.log(`OAuth app listening on port ${env.PORT}`);
});
