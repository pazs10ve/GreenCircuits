import { describe, expect, it } from "vitest"
import { pageNumbers } from "./pages"

describe("pageNumbers", () => {
  it("lists every page when there are few", () => {
    expect(pageNumbers(0, 1)).toEqual([0])
    expect(pageNumbers(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("keeps the first and last pages, and the neighbours of the current one, with gaps between", () => {
    expect(pageNumbers(9, 20)).toEqual([0, null, 8, 9, 10, null, 19])
  })

  it("shows the same number of buttons near either end, so the row doesn't jump", () => {
    expect(pageNumbers(0, 20)).toEqual([0, 1, 2, 3, 4, null, 19])
    expect(pageNumbers(2, 20)).toEqual([0, 1, 2, 3, 4, null, 19])
    expect(pageNumbers(19, 20)).toEqual([0, null, 15, 16, 17, 18, 19])
  })
})
