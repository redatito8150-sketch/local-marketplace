import test from "node:test";
import assert from "node:assert/strict";
import { calculateReviewSummary, isEligibleOrder, weightedBrandAverage } from "../lib/reviews/aggregates.ts";
import { parseReviewFilters, reportSchema, replySchema, reviewInputSchema, toReviewInsert } from "../lib/reviews/validation.ts";

const valid = { productId:"p1", orderItemId:"11111111-1111-4111-8111-111111111111", rating:5, title:"Lovely", body:"Excellent quality and fit." };
test("accepts a valid review input",()=>assert.equal(reviewInputSchema.safeParse(valid).success,true));
test("maps client review fields to database snake_case columns",()=>assert.deepEqual(toReviewInsert("user-1", valid),{
  user_id:"user-1",product_id:"p1",order_item_id:"11111111-1111-4111-8111-111111111111",rating:5,title:"Lovely",body:"Excellent quality and fit."
}));
test("rejects ratings outside one to five",()=>assert.equal(reviewInputSchema.safeParse({...valid,rating:6}).success,false));
test("rejects whitespace and short review text",()=>assert.equal(reviewInputSchema.safeParse({...valid,body:"   "}).success,false));
test("limits review title and body",()=>{assert.equal(reviewInputSchema.safeParse({...valid,title:"x".repeat(121)}).success,false);assert.equal(reviewInputSchema.safeParse({...valid,body:"x".repeat(2001)}).success,false);});
test("only fulfilled non-refunded orders are eligible",()=>{assert.equal(isEligibleOrder("fulfilled","paid"),true);assert.equal(isEligibleOrder("cancelled","paid"),false);assert.equal(isEligibleOrder("fulfilled","refunded"),false);});
test("calculates weighted brand rating",()=>assert.deepEqual(weightedBrandAverage([{rating:5,count:10},{rating:1,count:1}]),{average:51/11,total:11}));
test("returns safe zero-review summary",()=>assert.deepEqual(calculateReviewSummary([]),{average:0,total:0,distribution:{1:0,2:0,3:0,4:0,5:0},verifiedPercent:0,withPhotos:0}));
test("calculates distribution, photos and verified percent",()=>assert.deepEqual(calculateReviewSummary([{rating:5,imageCount:2,verifiedPurchase:true},{rating:3,verifiedPurchase:true}]),{average:4,total:2,distribution:{1:0,2:0,3:1,4:0,5:1},verifiedPercent:100,withPhotos:1}));
test("excludes hidden and deleted reviews from aggregates",()=>assert.equal(calculateReviewSummary([{rating:5,status:"hidden"},{rating:4,deleted:true}]).total,0));
test("parses and bounds public filter query",()=>assert.deepEqual(parseReviewFilters({rating:"5",photos:"1",sort:"helpful",page:"-8"}),{rating:5,photos:true,verified:false,replied:false,product:undefined,query:undefined,sort:"helpful",page:1}));
test("falls back safely for invalid filters",()=>{const value=parseReviewFilters({rating:"9",sort:"bad",page:"9999"});assert.equal(value.rating,undefined);assert.equal(value.sort,"recent");assert.equal(value.page,1000);});
test("validates report reasons",()=>{assert.equal(reportSchema.safeParse({reason:"spam"}).success,true);assert.equal(reportSchema.safeParse({reason:"revenge"}).success,false);});
test("validates brand response length",()=>{assert.equal(replySchema.safeParse({body:"Thank you"}).success,true);assert.equal(replySchema.safeParse({body:" "}).success,false);});
