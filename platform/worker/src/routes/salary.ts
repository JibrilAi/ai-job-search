import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { lookupSalary } from "../lib/db/repositories/salary.js"

const salary = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
salary.use("*", requireAuth)

salary.get("/:company", async (c) => {
  const company = decodeURIComponent(c.req.param("company"))
  const city = c.req.query("city")
  const rows = await lookupSalary(c.env, company, city)
  return c.json({ salary: rows })
})

export default salary
