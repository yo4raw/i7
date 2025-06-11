import { g as getCardById } from "../../../../chunks/queries.js";
import { e as error } from "../../../../chunks/index.js";
const load = async ({ params }) => {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw error(400, "Invalid card ID");
  }
  const card = await getCardById(id);
  if (!card) {
    throw error(404, "Card not found");
  }
  return {
    card
  };
};
export {
  load
};
