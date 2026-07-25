import { formatKnifeStatus, getPublicKnifeStatus } from "./knifeStatus";

describe("public knife status", () => {
  test("sold state always wins", () => {
    expect(getPublicKnifeStatus({ sold: true, saleStatus: "available" })).toBe("sold");
    expect(getPublicKnifeStatus({ saleStatus: "sold" })).toBe("sold");
    expect(getPublicKnifeStatus({ saleStatus: "available" }, { status: "paid" })).toBe("sold");
  });

  test("reserved and pending orders are not shown as available", () => {
    expect(getPublicKnifeStatus({ saleStatus: "reserved" })).toBe("pending");
    expect(getPublicKnifeStatus({}, { status: "pending" })).toBe("pending");
  });

  test("unknown empty state safely defaults to available", () => {
    expect(getPublicKnifeStatus()).toBe("available");
    expect(formatKnifeStatus("ready_to_ship")).toBe("Ready To Ship");
  });
});
