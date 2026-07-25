import { clearPurchaseIntent, readPurchaseIntent, savePurchaseIntent } from "./purchaseIntent";

describe("purchase intent", () => {
  beforeEach(() => {
    clearPurchaseIntent();
    jest.restoreAllMocks();
  });

  test("preserves a recent checkout destination through sign in", () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    savePurchaseIntent({ knifeId: "knife-1", returnTo: "/Store" });
    expect(readPurchaseIntent()).toMatchObject({ knifeId: "knife-1", returnTo: "/Store" });
  });

  test("clears stale or invalid checkout destinations", () => {
    sessionStorage.setItem("nk_purchase_intent", JSON.stringify({ knifeId: "knife-1", savedAt: 1 }));
    jest.spyOn(Date, "now").mockReturnValue(60 * 60 * 1000 + 2);
    expect(readPurchaseIntent()).toBeNull();

    sessionStorage.setItem("nk_purchase_intent", "{bad json");
    expect(readPurchaseIntent()).toBeNull();
  });
});
