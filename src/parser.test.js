import { describe, it, expect } from "vitest";
import { parseAudit } from "./logic/parser.js";
import sampleAudit from "./data/sample-audit.json";

describe("parseAudit", () => {
  it("accepts valid sample audit data", () => {
    const result = parseAudit(sampleAudit);
    expect(result).toEqual(sampleAudit);
  });

  it("rejects an unsupported schema version", () => {
    const invalidAudit = {
      ...sampleAudit,
      schemaVersion: 999,
    };

    expect(() => parseAudit(invalidAudit)).toThrow(
      "Unsupported audit JSON schema version.",
    );
  });

  it("rejects a course with an empty course code", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courses[0].code = "";

    expect(() => parseAudit(invalidAudit)).toThrow("must have a course code.");
  });

  it("rejects a course with invalid credits", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courses[0].credits = -3;

    expect(() => parseAudit(invalidAudit)).toThrow("must have valid credits.");
  });

  it("rejects duplicate course IDs", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courses[1].id = invalidAudit.courses[0].id;

    expect(() => parseAudit(invalidAudit)).toThrow(
      "Duplicate course ID found:",
    );
  });

  it("rejects an unsupported requirement selection type", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.requirements[0].selection.type = "unknown";

    expect(() => parseAudit(invalidAudit)).toThrow(
      "has an unsupported selection type.",
    );
  });

  it("rejects a requirement that references a nonexistent course", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.requirements[0].courseIds.push("CS 9999");

    expect(() => parseAudit(invalidAudit)).toThrow(
      "contains an invalid course ID.",
    );
  });

  it("rejects an invalid number of courses required", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.requirements[2].selection.coursesRequired = 0;

    expect(() => parseAudit(invalidAudit)).toThrow(
      "has an invalid coursesRequired value.",
    );
  });

  it("rejects negative requirement credits", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.requirements[0].requiredCredits = -5;

    expect(() => parseAudit(invalidAudit)).toThrow(
      "has an invalid requiredCredits value.",
    );
  });

  it("rejects a catalog entry that references a nonexistent course", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courseCatalog[0].courseId = "CS 9999";

    expect(() => parseAudit(invalidAudit)).toThrow(
      "Each catalog entry must reference an existing course.",
    );
  });

  it("rejects duplicate catalog entries", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courseCatalog.push(
      structuredClone(invalidAudit.courseCatalog[0]),
    );

    expect(() => parseAudit(invalidAudit)).toThrow(
      "Duplicate catalog entry found for CS 3020.",
    );
  });

  it("rejects an invalid availabilityKnown value", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courseCatalog[0].availabilityKnown = "yes";

    expect(() => parseAudit(invalidAudit)).toThrow(
      "must specify whether availability is known.",
    );
  });

  it("rejects invalid availableTerms", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courseCatalog[0].availableTerms = "Fall";

    expect(() => parseAudit(invalidAudit)).toThrow(
      "must have an availableTerms array of strings.",
    );
  });

  it("rejects invalid prerequisites", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courseCatalog[0].prerequisites = "CS 1010";

    expect(() => parseAudit(invalidAudit)).toThrow(
      "has invalid prerequisites.",
    );
  });

  it("rejects invalid corequisites", () => {
    const invalidAudit = structuredClone(sampleAudit);
    invalidAudit.courseCatalog[0].corequisites = "CS 1010";

    expect(() => parseAudit(invalidAudit)).toThrow("has invalid corequisites.");
  });

  it("accepts null prerequisites when they are unknown", () => {
    const audit = structuredClone(sampleAudit);
    audit.courseCatalog[0].prerequisites = null;

    expect(() => parseAudit(audit)).not.toThrow();
  });

  it("accepts null corequisites when they are unknown", () => {
    const audit = structuredClone(sampleAudit);
    audit.courseCatalog[0].corequisites = null;

    expect(() => parseAudit(audit)).not.toThrow();
  });

  it("accepts valid equivalent-course groups", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "equivalency-test",
      name: "Equivalency Test",
      selection: { type: "all" },
      requiredCredits: null,
      earnedCredits: null,
      remainingCredits: null,
      courseIds: [],
      eligibleCourseIds: [],
      courseGroups: [{ courseIds: ["CS 3020", "CS 3050"] }],
    });

    audit.courses[0].requirementIds.push("equivalency-test");
    audit.courses[1].requirementIds.push("equivalency-test");

    expect(() => parseAudit(audit)).not.toThrow();
  });

  it("rejects an equivalent-course group with an unknown course ID", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements[0].courseGroups = [{ courseIds: ["CS 9999"] }];

    expect(() => parseAudit(audit)).toThrow(
      "contains an invalid course group.",
    );
  });

  it("rejects an empty equivalent-course group", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements[0].courseGroups = [{ courseIds: [] }];

    expect(() => parseAudit(audit)).toThrow(
      "contains an invalid course group.",
    );
  });

  it.each(["pdf", "bookmarklet", "json"])(
    "accepts valid audit data from the %s source",
    (source) => {
      const audit = structuredClone(sampleAudit);
      audit.source = source;

      expect(() => parseAudit(audit)).not.toThrow();
    },
  );

  it("accepts a requirement with valid specialty-track subgroups", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 1,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "data-analytics",
          name: "Data Analytics Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: ["CS 4100"],
        },
        {
          id: "systems-engineering",
          name: "Systems Engineering Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: ["CS 4200"],
        },
        {
          id: "general-track",
          name: "General Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: ["ENGR 4300"],
        },
      ],
    });

    audit.courses[2].requirementIds.push("required-track");
    audit.courses[3].requirementIds.push("required-track");
    audit.courses[4].requirementIds.push("required-track");

    expect(() => parseAudit(audit)).not.toThrow();
  });

  it("rejects an invalid number of subgroups required", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 0,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "data-analytics",
          name: "Data Analytics Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: ["CS 4100"],
        },
      ],
    });

    expect(() => parseAudit(audit)).toThrow(
      "has an invalid subgroupsRequired value.",
    );
  });

  it("rejects a subgroup that references a nonexistent course", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 1,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "data-analytics",
          name: "Data Analytics Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: ["CS 9999"],
        },
      ],
    });

    expect(() => parseAudit(audit)).toThrow(
      "contains an invalid eligible course ID.",
    );
  });

  it("accepts valid categories within a subgroup", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 1,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "general-track",
          name: "General Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: [],
          categories: [
            {
              id: "data-analytics",
              name: "Data Analytics Courses",
              requiredCredits: 9,
              earnedCredits: 0,
              remainingCredits: 9,
              eligibleCourseIds: ["CS 4100"],
            },
            {
              id: "systems-engineering",
              name: "Systems Engineering Courses",
              requiredCredits: 9,
              earnedCredits: 0,
              remainingCredits: 9,
              eligibleCourseIds: ["CS 4200"],
            },
          ],
        },
      ],
    });

    expect(() => parseAudit(audit)).not.toThrow();
  });

  it("rejects duplicate category IDs within a subgroup", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 1,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "general-track",
          name: "General Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: [],
          categories: [
            {
              id: "general-category",
              name: "Data Analytics Courses",
              requiredCredits: 9,
              earnedCredits: 0,
              remainingCredits: 9,
              eligibleCourseIds: ["CS 4100"],
            },
            {
              id: "general-category",
              name: "Systems Engineering Courses",
              requiredCredits: 9,
              earnedCredits: 0,
              remainingCredits: 9,
              eligibleCourseIds: ["CS 4200"],
            },
          ],
        },
      ],
    });

    expect(() => parseAudit(audit)).toThrow(
      "contains a duplicate category ID:",
    );
  });

  it("rejects negative category credits", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 1,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "general-track",
          name: "General Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: [],
          categories: [
            {
              id: "data-analytics",
              name: "Data Analytics Courses",
              requiredCredits: -9,
              earnedCredits: 0,
              remainingCredits: 9,
              eligibleCourseIds: ["CS 4100"],
            },
          ],
        },
      ],
    });

    expect(() => parseAudit(audit)).toThrow(
      "has an invalid requiredCredits value.",
    );
  });

  it("rejects a category that references a nonexistent course", () => {
    const audit = structuredClone(sampleAudit);

    audit.requirements.push({
      id: "required-track",
      name: "Required Track",
      selection: {
        type: "choose",
        subgroupsRequired: 1,
      },
      requiredCredits: 18,
      earnedCredits: 0,
      remainingCredits: 18,
      courseIds: [],
      eligibleCourseIds: [],
      subgroups: [
        {
          id: "general-track",
          name: "General Track",
          requiredCredits: 18,
          earnedCredits: 0,
          remainingCredits: 18,
          eligibleCourseIds: [],
          categories: [
            {
              id: "data-analytics",
              name: "Data Analytics Courses",
              requiredCredits: 9,
              earnedCredits: 0,
              remainingCredits: 9,
              eligibleCourseIds: ["CS 9999"],
            },
          ],
        },
      ],
    });

    expect(() => parseAudit(audit)).toThrow(
      "contains an invalid eligible course ID.",
    );
  });
});
