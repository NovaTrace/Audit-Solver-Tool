// Validates and normalizes imported degree audit data.

export function parseAudit(rawAudit) {
  // Step 1: Validate the overall JSON structure.
  if (!rawAudit || typeof rawAudit !== "object" || Array.isArray(rawAudit)) {
    throw new Error("Audit data must be a valid JSON object.");
  }

  if (rawAudit.schemaVersion !== 1) {
    throw new Error("Unsupported audit JSON schema version.");
  }

  const validSources = ["pdf", "bookmarklet", "json"];

  if (!validSources.includes(rawAudit.source)) {
    throw new Error("Audit data has an invalid source.");
  }

  if (
    !rawAudit.student ||
    typeof rawAudit.student !== "object" ||
    Array.isArray(rawAudit.student)
  ) {
    throw new Error("Audit data is missing student information.");
  }

  if (
    !rawAudit.credits ||
    typeof rawAudit.credits !== "object" ||
    Array.isArray(rawAudit.credits)
  ) {
    throw new Error("Audit data is missing credit information.");
  }

  if (!Array.isArray(rawAudit.courses)) {
    throw new Error("Audit data must contain a courses array.");
  }

  if (!Array.isArray(rawAudit.requirements)) {
    throw new Error("Audit data must contain a requirements array.");
  }

  if (!Array.isArray(rawAudit.courseCatalog)) {
    throw new Error("Audit data must contain a courseCatalog array.");
  }

  // Step 2: Validate student information and credits.
  if (
    typeof rawAudit.student.name !== "string" ||
    rawAudit.student.name.trim() === ""
  ) {
    throw new Error("Student name must be a non-empty string.");
  }

  if (
    !Array.isArray(rawAudit.student.majors) ||
    !rawAudit.student.majors.every((major) => typeof major === "string")
  ) {
    throw new Error("Student majors must be an array of strings.");
  }

  if (
    !Array.isArray(rawAudit.student.minors) ||
    !rawAudit.student.minors.every((minor) => typeof minor === "string")
  ) {
    throw new Error("Student minors must be an array of strings.");
  }

  if (
    typeof rawAudit.credits.earned !== "number" ||
    !Number.isFinite(rawAudit.credits.earned) ||
    rawAudit.credits.earned < 0
  ) {
    throw new Error("Earned credits must be a non-negative number.");
  }

  if (
    rawAudit.credits.required !== null &&
    (typeof rawAudit.credits.required !== "number" ||
      !Number.isFinite(rawAudit.credits.required) ||
      rawAudit.credits.required <= 0)
  ) {
    throw new Error("Required credits must be a positive number or null.");
  }

  if (
    rawAudit.credits.required !== null &&
    rawAudit.credits.earned > rawAudit.credits.required
  ) {
    throw new Error("Earned credits cannot exceed required credits.");
  }

  // Step 3: Validate courses.
  const courseIds = new Set();

  for (const course of rawAudit.courses) {
    if (!course || typeof course !== "object" || Array.isArray(course)) {
      throw new Error("Each course must be a valid object.");
    }

    if (typeof course.id !== "string" || course.id.trim() === "") {
      throw new Error("Each course must have a non-empty ID.");
    }

    if (courseIds.has(course.id)) {
      throw new Error(`Duplicate course ID found: ${course.id}`);
    }

    courseIds.add(course.id);

    if (typeof course.code !== "string" || course.code.trim() === "") {
      throw new Error(`Course ${course.id} must have a course code.`);
    }

    if (typeof course.title !== "string" || course.title.trim() === "") {
      throw new Error(`Course ${course.id} must have a title.`);
    }

    if (
      typeof course.credits !== "number" ||
      !Number.isFinite(course.credits) ||
      course.credits <= 0
    ) {
      throw new Error(`Course ${course.id} must have valid credits.`);
    }

    if (
      !Array.isArray(course.requirementIds) ||
      !course.requirementIds.every((id) => typeof id === "string")
    ) {
      throw new Error(
        `Course ${course.id} must have a requirementIds array of strings.`,
      );
    }
  }

  // Step 4: Validate degree requirements.
  const requirementIds = new Set();

  for (const requirement of rawAudit.requirements) {
    if (
      !requirement ||
      typeof requirement !== "object" ||
      Array.isArray(requirement)
    ) {
      throw new Error("Each requirement must be a valid object.");
    }

    if (typeof requirement.id !== "string" || requirement.id.trim() === "") {
      throw new Error("Each requirement must have a non-empty ID.");
    }

    if (requirementIds.has(requirement.id)) {
      throw new Error(`Duplicate requirement ID found: ${requirement.id}`);
    }

    requirementIds.add(requirement.id);

    if (
      typeof requirement.name !== "string" ||
      requirement.name.trim() === ""
    ) {
      throw new Error(`Requirement ${requirement.id} must have a name.`);
    }

    if (
      !requirement.selection ||
      typeof requirement.selection !== "object" ||
      Array.isArray(requirement.selection)
    ) {
      throw new Error(
        `Requirement ${requirement.id} must have a selection type.`,
      );
    }

    const validCourseIds = (ids) =>
      Array.isArray(ids) &&
      ids.every((id) => typeof id === "string" && courseIds.has(id));

    if (!validCourseIds(requirement.courseIds)) {
      throw new Error(
        `Requirement ${requirement.id} contains an invalid course ID.`,
      );
    }

    if (!validCourseIds(requirement.eligibleCourseIds)) {
      throw new Error(
        `Requirement ${requirement.id} contains an invalid eligible course ID.`,
      );
    }

    // Validate equivalent-course groups, when provided.
    if (requirement.courseGroups !== undefined) {
      if (!Array.isArray(requirement.courseGroups)) {
        throw new Error(
          `Requirement ${requirement.id} must have a courseGroups array.`,
        );
      }

      for (const group of requirement.courseGroups) {
        if (
          !group ||
          typeof group !== "object" ||
          Array.isArray(group) ||
          !Array.isArray(group.courseIds) ||
          group.courseIds.length === 0 ||
          !validCourseIds(group.courseIds)
        ) {
          throw new Error(
            `Requirement ${requirement.id} contains an invalid course group.`,
          );
        }

        if (new Set(group.courseIds).size !== group.courseIds.length) {
          throw new Error(
            `Requirement ${requirement.id} contains duplicate course IDs in a group.`,
          );
        }
      }
    }

    // Validate subgroups, when provided.
    if (requirement.subgroups !== undefined) {
      if (
        !Array.isArray(requirement.subgroups) ||
        requirement.subgroups.length === 0
      ) {
        throw new Error(
          `Requirement ${requirement.id} must have a non-empty subgroups array.`,
        );
      }

      const subgroupIds = new Set();

      for (const subgroup of requirement.subgroups) {
        if (
          !subgroup ||
          typeof subgroup !== "object" ||
          Array.isArray(subgroup)
        ) {
          throw new Error(
            `Requirement ${requirement.id} contains an invalid subgroup.`,
          );
        }

        if (typeof subgroup.id !== "string" || subgroup.id.trim() === "") {
          throw new Error(
            `Requirement ${requirement.id} contains a subgroup with an invalid ID.`,
          );
        }

        if (subgroupIds.has(subgroup.id)) {
          throw new Error(
            `Requirement ${requirement.id} contains a duplicate subgroup ID: ${subgroup.id}.`,
          );
        }

        subgroupIds.add(subgroup.id);

        if (typeof subgroup.name !== "string" || subgroup.name.trim() === "") {
          throw new Error(
            `Subgroup ${subgroup.id} must have a non-empty name.`,
          );
        }

        for (const field of [
          "requiredCredits",
          "earnedCredits",
          "remainingCredits",
        ]) {
          if (
            typeof subgroup[field] !== "number" ||
            !Number.isFinite(subgroup[field]) ||
            subgroup[field] < 0
          ) {
            throw new Error(
              `Subgroup ${subgroup.id} has an invalid ${field} value.`,
            );
          }
        }

        if (!validCourseIds(subgroup.eligibleCourseIds)) {
          throw new Error(
            `Subgroup ${subgroup.id} contains an invalid eligible course ID.`,
          );
        }

        if (subgroup.courseGroups !== undefined) {
          if (!Array.isArray(subgroup.courseGroups)) {
            throw new Error(
              `Subgroup ${subgroup.id} must have a courseGroups array.`,
            );
          }

          for (const group of subgroup.courseGroups) {
            if (
              !group ||
              typeof group !== "object" ||
              Array.isArray(group) ||
              !Array.isArray(group.courseIds) ||
              group.courseIds.length === 0 ||
              !validCourseIds(group.courseIds)
            ) {
              throw new Error(
                `Subgroup ${subgroup.id} contains an invalid course group.`,
              );
            }

            if (new Set(group.courseIds).size !== group.courseIds.length) {
              throw new Error(
                `Subgroup ${subgroup.id} contains duplicate course IDs in a group.`,
              );
            }
          }
        }

        // Validate optional categories within a subgroup.
        if (subgroup.categories !== undefined) {
          if (!Array.isArray(subgroup.categories)) {
            throw new Error(
              `Subgroup ${subgroup.id} must have a categories array.`,
            );
          }

          const categoryIds = new Set();

          for (const category of subgroup.categories) {
            if (
              !category ||
              typeof category !== "object" ||
              Array.isArray(category)
            ) {
              throw new Error(
                `Subgroup ${subgroup.id} contains an invalid category.`,
              );
            }

            if (typeof category.id !== "string" || category.id.trim() === "") {
              throw new Error(
                `Subgroup ${subgroup.id} contains a category with an invalid ID.`,
              );
            }

            if (categoryIds.has(category.id)) {
              throw new Error(
                `Subgroup ${subgroup.id} contains a duplicate category ID: ${category.id}.`,
              );
            }

            categoryIds.add(category.id);

            if (
              typeof category.name !== "string" ||
              category.name.trim() === ""
            ) {
              throw new Error(
                `Category ${category.id} must have a non-empty name.`,
              );
            }

            for (const field of [
              "requiredCredits",
              "earnedCredits",
              "remainingCredits",
            ]) {
              if (
                typeof category[field] !== "number" ||
                !Number.isFinite(category[field]) ||
                category[field] < 0
              ) {
                throw new Error(
                  `Category ${category.id} has an invalid ${field} value.`,
                );
              }
            }

            if (!validCourseIds(category.eligibleCourseIds)) {
              throw new Error(
                `Category ${category.id} contains an invalid eligible course ID.`,
              );
            }
          }
        }
      }
    }

    // Validate selection rules.
    if (
      requirement.selection.type === "all" &&
      requirement.eligibleCourseIds.length > 0
    ) {
      throw new Error(
        `Requirement ${requirement.id} cannot use eligibleCourseIds with the all selection type.`,
      );
    }

    if (requirement.selection.type === "choose") {
      const choosingCourses =
        Number.isInteger(requirement.selection.coursesRequired) &&
        requirement.selection.coursesRequired > 0 &&
        requirement.selection.coursesRequired <=
          requirement.eligibleCourseIds.length;

      const choosingSubgroups =
        Number.isInteger(requirement.selection.subgroupsRequired) &&
        requirement.selection.subgroupsRequired > 0 &&
        Array.isArray(requirement.subgroups) &&
        requirement.selection.subgroupsRequired <= requirement.subgroups.length;

      if (!choosingCourses && !choosingSubgroups) {
        if (requirement.selection.subgroupsRequired !== undefined) {
          throw new Error(
            `Requirement ${requirement.id} has an invalid subgroupsRequired value.`,
          );
        }

        throw new Error(
          `Requirement ${requirement.id} has an invalid coursesRequired value.`,
        );
      }

      if (choosingCourses && choosingSubgroups) {
        throw new Error(
          `Requirement ${requirement.id} cannot specify both coursesRequired and subgroupsRequired.`,
        );
      }
    }

    if (
      requirement.selection.type === "credits" &&
      (typeof requirement.selection.creditsRequired !== "number" ||
        !Number.isFinite(requirement.selection.creditsRequired) ||
        requirement.selection.creditsRequired <= 0)
    ) {
      throw new Error(
        `Requirement ${requirement.id} has an invalid creditsRequired value.`,
      );
    }

    if (!["all", "choose", "credits"].includes(requirement.selection.type)) {
      throw new Error(
        `Requirement ${requirement.id} has an unsupported selection type.`,
      );
    }

    for (const field of [
      "requiredCredits",
      "earnedCredits",
      "remainingCredits",
    ]) {
      const value = requirement[field];

      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      ) {
        throw new Error(
          `Requirement ${requirement.id} has an invalid ${field} value.`,
        );
      }
    }
  }

  // Verify that course requirement references are valid.
  for (const course of rawAudit.courses) {
    for (const requirementId of course.requirementIds) {
      const requirement = rawAudit.requirements.find(
        (item) => item.id === requirementId,
      );

      if (
        !requirement ||
        (!requirement.courseIds.includes(course.id) &&
          !requirement.eligibleCourseIds.includes(course.id) &&
          !(requirement.courseGroups ?? []).some((group) =>
            group.courseIds.includes(course.id),
          ) &&
          !(requirement.subgroups ?? []).some(
            (subgroup) =>
              subgroup.eligibleCourseIds.includes(course.id) ||
              (subgroup.courseGroups ?? []).some((group) =>
                group.courseIds.includes(course.id),
              ),
          ))
      ) {
        throw new Error(
          `Course ${course.id} has an invalid requirement reference: ${requirementId}.`,
        );
      }
    }
  }

  // Step 5: Validate course catalog information.
  const catalogCourseIds = new Set();

  for (const catalogEntry of rawAudit.courseCatalog) {
    if (
      !catalogEntry ||
      typeof catalogEntry !== "object" ||
      Array.isArray(catalogEntry)
    ) {
      throw new Error("Each catalog entry must be a valid object.");
    }

    if (
      typeof catalogEntry.courseId !== "string" ||
      !courseIds.has(catalogEntry.courseId)
    ) {
      throw new Error("Each catalog entry must reference an existing course.");
    }

    if (catalogCourseIds.has(catalogEntry.courseId)) {
      throw new Error(
        `Duplicate catalog entry found for ${catalogEntry.courseId}.`,
      );
    }

    catalogCourseIds.add(catalogEntry.courseId);

    if (
      !Array.isArray(catalogEntry.availableTerms) ||
      !catalogEntry.availableTerms.every((term) => typeof term === "string")
    ) {
      throw new Error(
        `Catalog entry for ${catalogEntry.courseId} must have an availableTerms array of strings.`,
      );
    }

    if (typeof catalogEntry.availabilityKnown !== "boolean") {
      throw new Error(
        `Catalog entry for ${catalogEntry.courseId} must specify whether availability is known.`,
      );
    }

    if (
      catalogEntry.prerequisites !== null &&
      (!Array.isArray(catalogEntry.prerequisites) ||
        !catalogEntry.prerequisites.every(
          (courseId) => typeof courseId === "string",
        ))
    ) {
      throw new Error(
        `Catalog entry for ${catalogEntry.courseId} has invalid prerequisites.`,
      );
    }

    if (
      catalogEntry.corequisites !== null &&
      (!Array.isArray(catalogEntry.corequisites) ||
        !catalogEntry.corequisites.every(
          (courseId) => typeof courseId === "string",
        ))
    ) {
      throw new Error(
        `Catalog entry for ${catalogEntry.courseId} has invalid corequisites.`,
      );
    }
  }

  // Step 6: Return normalized audit data.
  return rawAudit;
}
