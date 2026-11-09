const [major, minor] = process.versions.node.split(".").map(Number);
const supported = major > 22 || (major === 22 && minor >= 13);

if (!supported) {
  console.error(
    `Node.js ${process.versions.node} is unsupported. Install Node.js 22.13.0 or newer for Hardhat 3.`,
  );
  process.exit(1);
}

console.log(`Node.js ${process.versions.node} satisfies the Hardhat 3 requirement.`);
