import io from "@pm2/io";
import SnapMetrics from "../../dist/index.js";

function setupPm2Metrics() {
  const sm = new SnapMetrics();

  const pm2Metrics = {};
  const initialAverages = sm.getAverages();

  for (const key in initialAverages) {
    pm2Metrics[key] = io.metric({ name: `Response Time (${key})`, unit: "ms" });
  }

  setInterval(() => {
    const updatedAverages = sm.getAverages();

    for (const key in updatedAverages) {
      if (pm2Metrics[key]) {
        pm2Metrics[key].set(updatedAverages[key]);
      }
    }
  }, 1000);
}

setupPm2Metrics();
