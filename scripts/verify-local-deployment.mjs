import { verifyLiveDeployment } from "./local-deployment.mjs";

const { config, serviceAddress, tokenAddress, treasury } = await verifyLiveDeployment();
console.log(
  JSON.stringify(
    {
      status: "verified",
      chainId: config.network.chainId,
      network: config.network.name,
      accessToken: tokenAddress,
      aiServiceAccess: serviceAddress,
      treasury,
    },
    null,
    2,
  ),
);
