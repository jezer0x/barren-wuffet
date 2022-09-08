describe("Utils", () => {
  describe("Subscriptions.Constraints Validation", () => {
    it("Should revert if minCollateralPerSub > maxCollateralPerSub", async function () {});
    it("Should revert if minTotalCollateral > maxTotalCollateral", async function () {});
    it("Should revert if deadline is in the past", async function () {});
    it("Should revert if lockin is in the past", async function () {});
    it("Should revert if subscriberToManagerFeePercentage dooes not make sense", async function () {});
    it("Should revert if totalCollateral and perSub conflict", async function () {});
  });
});
