// Vercel Node function. The static screener works independently of this endpoint.
import { createReviewHandler } from "../server/hosted-review.mjs";

export default createReviewHandler();
