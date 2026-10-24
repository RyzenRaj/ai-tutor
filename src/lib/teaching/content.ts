import type { TeachingText } from "./sequence";

/**
 * Built-in teaching text per capability. Plain language first; every claim here is general
 * and true for the simulation — numbers that depend on the learner's input are computed by
 * the engines, never written here.
 */

export const BINARY_SEARCH_TEXT: TeachingText = {
  definition: "Binary search finds a target in sorted data by repeatedly halving the range where the target could still be.",
  why: "Checking values one by one can take as many steps as there are values. Halving needs far fewer: for 1,000,000 sorted values, at most 20 comparisons instead of up to a million.",
  analogy: "It works like looking up a word in a dictionary: open near the middle, see whether your word comes before or after that page, and keep only that half. Repeat until you land on the word.",
  analogyLimit: "you might guess where a word sits from its first letter, but binary search always checks the exact middle index and compares a single value. It also only works because the data is sorted.",
  summary: {
    insight: "each comparison throws away half of the remaining candidates, so the work grows with log₂ n, not n.",
    whenToUse: "the data is sorted (or a yes/no condition flips exactly once across the range) and you can jump straight to any index.",
    commonMistake: "mixing loop styles, e.g. `while low < high` together with `high = mid - 1`, which can skip the last candidate; or running it on unsorted data.",
  },
};

export const SQL_JOIN_TEXT: TeachingText = {
  definition: "A JOIN combines rows from two tables by pairing the rows whose join columns match. INNER JOIN keeps only those pairs; LEFT JOIN also keeps every left row that found no partner, with NULLs on the right.",
  why: "Databases store each fact once (a department's name lives in one row) to avoid copies drifting apart. A JOIN puts the pieces back together when you query.",
  analogy: "Think of guests and a seating chart: each guest holds a table number and looks up every chart entry with that same number. One seat card is printed per match.",
  analogyLimit: "one guest can match several entries (one row fans out into several results), and a guest with no table number (NULL) matches nothing, not even another blank.",
  summary: {
    insight: "a join pairs rows on a condition; rows can fan out (one-to-many) or disappear (no match in an INNER JOIN).",
    whenToUse: "INNER when you only want matched data; LEFT when every row of the left table must stay in the result.",
    commonMistake: "filtering the right table in WHERE after a LEFT JOIN (e.g. WHERE d.dept_name = 'Data'), which drops the NULL rows and silently turns it into an INNER JOIN. Put such conditions in ON.",
  },
};

export const SPARK_SHUFFLE_TEXT: TeachingText = {
  definition: "A shuffle redistributes data across the cluster so that every record with the same key ends up in the same partition. Wide transformations like reduceByKey, groupByKey and joins need one.",
  why: "Each task only sees its own partition. To total a key, every partial value for that key must meet in one place, and moving data between machines is one of the most expensive things Spark does.",
  analogy: "Picture a post office: each local office (a map task) bundles its letters by destination city, then trucks carry each bundle to that city's office (a reduce task).",
  analogyLimit: "Spark chooses the destination with a hash of the key, not geography, and it combines letters bound for the same place before shipping (map-side combine).",
  summary: {
    insight: "a shuffle is the stage boundary where data moves so equal keys meet; it costs network, disk and time.",
    whenToUse: "prefer reduceByKey or aggregateByKey over groupByKey, because they combine values before the shuffle.",
    commonMistake: "treating the shuffle as free; a skewed key (one huge key) sends most of the data to one task and stalls the whole stage.",
  },
};
