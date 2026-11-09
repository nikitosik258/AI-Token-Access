import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

/**
 * Hardhat 3 configuration.
 *
 * The Viem toolbox supplies the Node.js test runner, Viem helpers, and
 * Hardhat Ignition. Do not add Hardhat 2 plugins to this project.
 */
export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: "0.8.28",
  networks: {
    local: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
  },
});
