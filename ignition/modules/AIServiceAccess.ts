import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/** Deploys STK first, then injects its address into the subscription contract. */
const AIServiceAccessModule = buildModule("AIServiceAccessModule", (m) => {
  const treasury = m.getParameter<string>("treasury");
  const accessToken = m.contract("AccessToken");
  const aiServiceAccess = m.contract("AIServiceAccess", [accessToken, treasury]);

  return { accessToken, aiServiceAccess };
});

export default AIServiceAccessModule;
