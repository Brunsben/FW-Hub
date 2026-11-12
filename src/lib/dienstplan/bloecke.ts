import { sql } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { DpFehler } from "@/lib/dienstplan/route";

/** Themen eines Blocks ersetzen (Reihenfolge = Reihenfolge der ids). Alle Themen müssen zur Organisation gehören. */
export async function schreibeBlockThemen(tx: ScopedTx, organisationId: number, blockId: number, themaIds: number[]) {
  const vorhanden = await tx.execute<{ id: number }>(sql`
    select id from dienstplan.themen where organisation_id = ${organisationId} and id in (${sql.join(themaIds.map((i) => sql`${i}`), sql`, `)})`);
  if (vorhanden.length !== themaIds.length) throw new DpFehler(400, "Ein Thema des Blocks gibt es nicht");
  await tx.execute(sql`delete from dienstplan.themenblock_positionen where block_id = ${blockId}`);
  for (const [i, themaId] of themaIds.entries()) {
    expectRows(await tx.execute(sql`
      insert into dienstplan.themenblock_positionen (block_id, thema_id, position) values (${blockId}, ${themaId}, ${i + 1}) returning id`), "Blockposition");
  }
}
