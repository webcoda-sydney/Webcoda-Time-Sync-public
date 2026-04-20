import { getEnv } from "./env.js";
import app from "./app.js";

const env = getEnv();

app.listen(env.PORT, () => {
  console.log(`OAuth app listening on port ${env.PORT}`);
});
