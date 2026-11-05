
/**
 * Extracts course-history records from degree-audit text.
 * This handles course history only; requirement interpretation comes next.
 */
export function parseAuditCourses(pageText) {
  const courses = [];

  const coursePattern =
    /\b(FA|SP|SU)(\d{2})\s+([A-Z]{2,5}\s*\d{4})\s+(\d+(?:\.\d+)?)\s+(\*{3}|[A-F][+-]?)(?:\s*(>[A-Z]))?\s+(.+?)(?=\s+(?:FA|SP|SU)\d{2}\s+[A-Z]{2,5}\s*\d{4}\s+|\s+IN-P\b|$)/g;

  for (const match of pageText.matchAll(coursePattern)) {
    const grade = match[5];
    let title = match[7].trim();

    title = title.replace(/\s*PROCESSED\s+AS:.*/i, "").trim();
    title = title.replace(/\s+/g, " ");

    courses.push({
      term: `${match[1]}${match[2]}`,
      courseCode: match[3].replace(/\s+/g, " ").trim(),
      credits: Number(match[4]),
      grade,
      gradeMarker: match[6] ?? "",
      status:
        grade === "***" ? "Registered" : grade === "F" ? "Failed" : "Completed",
      title,
    });
  }

  return courses;
}

/**
 * Extracts the text from the degree requirement pages.
 */
export function extractRequirementPages(pages) {
  return pages.map((text, index) => ({
    pageNumber: index + 1,
    text: text.replace(/\s+/g, " ").trim(),
  }));
}

/**
 * Identifies requirement markers in extracted degree-audit text.
 */
export function parseRequirementMarkers(requirementPages) {
  return requirementPages.map(({ pageNumber, text }) => {
    const needsHours = text.match(/\bNEEDS:\s*(\d+(?:\.\d+)?)\s*HOURS\b/i);
    const earnedHours = text.match(/\bEARNED:\s*(\d+(?:\.\d+)?)\s*HOURS\b/i);
    const inProgressHours = text.match(
      /\bIN PROGRESS\s+(\d+(?:\.\d+)?)\s+HOURS\b/i,
    );

    return {
      pageNumber,
      needsHours: needsHours ? Number(needsHours[1]) : null,
      earnedHours: earnedHours ? Number(earnedHours[1]) : null,
      inProgressHours: inProgressHours ? Number(inProgressHours[1]) : null,
      hasNoStatus: /\bNO\b/.test(text),
      hasInProgress: /\bIN PROGRESS\b/i.test(text),
      hasRequiredSection: /\bREQUIRED\b/i.test(text),
      hasSelectFrom: /\bSELECT FROM:/i.test(text),
    };
  });
}

/**
 * Finds recognizable requirement headings in the extracted audit text.
 * This is for inspection; it does not determine completion status.
 */
export function extractRequirementHeadings(requirementPages) {
  const headingPatterns = [
    /Data Analytics & Systems Engineering\s*-\s*Required Core/i,
    /UPPER-DIVISION WRITING INTENSIVE COURSE/i,
    /WRITING INTENSIVE COURSE/i,
    /REQUIRED SPECIALTY TRACK/i,
    /GENERAL TRACK/i,
    /SYSTEMS ENGINEERING TRACK/i,
    /DATA ANALYTICS TRACK/i,
    /TECHNICAL ELECTIVES/i,
    /DASE\s*-\s*REQUIRED MATHEMATICS/i,
  ];

  return requirementPages
    .filter(({ pageNumber }) => pageNumber >= 7 && pageNumber <= 10)
    .flatMap(({ pageNumber, text }) =>
      headingPatterns.flatMap((pattern) => {
        const match = text.match(pattern);

        return match ? [{ pageNumber, heading: match[0].trim() }] : [];
      }),
    );
}

/**
 * Extracts explicit requirement statuses and records whether the page
 * contains the audit's "work not applied" section marker.
 */
export function extractRequirementStatuses(pages) {
  const statusPattern =
    /([A-Z][A-Za-z&'’./-]*(?:\s+[A-Z][A-Za-z&'’./-]*){0,8})\s*-\s*([^]+?)\s+(NO|IP|OK)\b/g;

  return pages.flatMap((text, index) => {
    const isWorkNotAppliedPage = /WORK NOT APPLIED TO THIS PROGRAM/i.test(text);

    return [...text.matchAll(statusPattern)].map((match) => ({
      pageNumber: index + 1,
      program: match[1].trim(),
      requirement: match[2].trim(),
      status: match[3],
      isWorkNotAppliedPage,
    }));
  });
}

/**
 * Groups degree requirements by their explicit audit status.
 */
export function summarizeRequirementStatuses(requirementStatuses) {
  return requirementStatuses.reduce(
    (summary, requirement) => {
      if (requirement.requirement === "Program Information") {
        summary.programInformation.push(requirement);
      } else if (requirement.isWorkNotAppliedPage) {
        summary.needsReview.push(requirement);
      } else if (requirement.status === "OK") {
        summary.satisfied.push(requirement);
      } else if (requirement.status === "IP") {
        summary.inProgress.push(requirement);
      } else if (requirement.status === "NO") {
        summary.notSatisfied.push(requirement);
      }

      return summary;
    },
    {
      programInformation: [],
      satisfied: [],
      inProgress: [],
      notSatisfied: [],
      needsReview: [],
    },
  );
}

/**
 * Extracts the page-level summary and Required Core section.
 */
export function extractRequiredCoreText(requirementPages) {
  const requiredCorePage = requirementPages.find((page) =>
    /\bRequired Core\s+(?:NO|IP|OK)\b/i.test(page.text),
  );

  if (!requiredCorePage) {
    return null;
  }

  const text = requiredCorePage.text;

  const summaryMatch = text.match(
    /IN PROGRESS\s+([\d.]+)\s+HOURS\s+NEEDS:\s*([\d.]+)\s+HOURS\s+EARNED:\s*([\d.]+)\s+HOURS/i,
  );

  const coreStart = text.search(
    /\bRequired Core\s+(?:NO|IP|OK)\b/i,
  );

  return {
    pageNumber: requiredCorePage.pageNumber,
    summary: summaryMatch
      ? {
          inProgressHours: Number(summaryMatch[1]),
          needsHours: Number(summaryMatch[2]),
          earnedHours: Number(summaryMatch[3]),
        }
      : null,
    coreSection: coreStart !== -1 ? text.slice(coreStart) : null,
  };
}

/**
 * Extracts course records explicitly shown under Required Core.
 */
export function parseRequiredCoreCourse(coreSection) {
  if (!coreSection) {
    return [];
  }

  const coursePattern =
    /\b(FA|SP|SU)\d{2}\s+([A-Z]{2,5}\s?\d{4})\s+(\d+(?:\.\d+)?)\s+([A-F][+-]?|\*{3})\s+(.+?)(?=\s+(?:FA|SP|SU)\d{2}\s+[A-Z]{2,5}\s?\d{4}\b|$)/gi;

  return [...coreSection.matchAll(coursePattern)].map((match) => {
    const title = match[5]
      .split(/>>MATCHED AS:|\+\s*(?:DASE|CS)\s+\d{4}\b/i)[0]
      .trim();

    return {
      term: match[1].toUpperCase() + match[0].match(/(?:FA|SP|SU)\d{2}/i)[0].slice(2),
      courseCode: match[2].trim(),
      credits: Number(match[3]),
      grade: match[4],
      title,
    };
  });
}

/**
 * Splits degree-audit pages into requirement sections.
 * Specialty-track options are marked as alternatives when a
 * Required Specialty Track parent exists.
 */
export function extractRequirementSections(requirementPages) {

  const hasSpecialtyParent = requirementPages.some((page) =>
    /\bREQUIRED SPECIALTY TRACK\b/i.test(page.text),
  );

  return requirementPages.flatMap(({ pageNumber, text }) => {
    const matches = [];

    // Match minor headings independently.
const minorHeadingPattern =
  /(?<![A-Za-z&'’./-])([A-Z][A-Za-z&'’./-]*(?:\s+[A-Z][A-Za-z&'’./-]*){0,2}\s+Minor)\s+(NO|IP|OK)\b/g;

for (const match of text.matchAll(minorHeadingPattern)) {
  const heading = match[0].replace(/^GPA\s+/, "");
  const offset = match[0].indexOf(heading);

  matches.push({
    index: match.index + offset,
    text: heading,
  });
}

    // Match the other known heading patterns.
    const otherHeadingPattern = /\+\s*GATEWAY PROGRAM SEMINAR|\+\s*SUSTAINABILITY|\+\s*INCLUSIVENESS|-\s*SUMMIT|\+\s*NAVIGATE|\+\s*EXPLORE\s*-\s*[^+]+?(?=\s+Complete\b)|\+\s*UPPER-DIVISION WRITING INTENSIVE COURSE\b|\+\s*WRITING INTENSIVE COURSE\b|\bREQUIRED SPECIALTY TRACK\b|\bTECHNICAL ELECTIVES\b|\b(?<![\w-])(?!(?:SUB-GROUPS?|HOURS)\b)[A-Z][A-Za-z&'’./-]*(?:\s+(?!SUB-GROUPS?\b|HOURS\b)[A-Z][A-Za-z&'’./-]*){0,8}?\s*-\s*[^+]{1,80}?\s+(?:NO|IP|OK)\b/g;

    for (const match of text.matchAll(otherHeadingPattern)) {
      matches.push({
        index: match.index,
        text: match[0],
      });
    }

    // Remove duplicate matches and sort by their original text position.
    const headings = [
      ...new Map(
        matches.map((match) => [
          `${match.index}:${match.text}`,
          match,
        ]),
      ).values(),
    ].sort((a, b) => a.index - b.index);

    // Remove overlapping matches, keeping the earliest/most specific heading.
    const filteredHeadings = headings.filter((heading, index) => {
      const previous = headings[index - 1];

      return (
        !previous ||
        heading.index >= previous.index + previous.text.length
      );
    });

    return filteredHeadings.map((match, index) => {
      const heading = match.text.trim();
      const normalizedHeading = heading.replace(/^\+\s*/, "").toUpperCase();

      const start = match.index;
      const nextHeading = filteredHeadings[index + 1];
      const end = nextHeading ? nextHeading.index : text.length;

      const isSpecialtyOption =
        hasSpecialtyParent &&
        normalizedHeading !== "REQUIRED SPECIALTY TRACK" &&
        /\b(?:TRACK|SPECIALTY AREA)\b/i.test(heading);

      return {
        pageNumber,
        heading,
        content: text.slice(start + match.text.length, end).trim(),
        sectionType: isSpecialtyOption
          ? "alternative-track"
          : "requirement",
        parentRequirement: isSpecialtyOption
          ? "REQUIRED SPECIALTY TRACK"
          : null,
      };
    });
  });
}

/**
 * Groups specialty-track options under their shared requirement.
 */
export function getSpecialtyTrackOptions(requirementSections) {
  return requirementSections.filter(
    (section) =>
      section.sectionType === "alternative-track" &&
      section.parentRequirement === "REQUIRED SPECIALTY TRACK",
  );
}

/**
 * Extracts remaining hours and course records printed within each
 * specialty-track option.
 */
export function getSpecialtyTrackNeeds(requirementSections) {
  return getSpecialtyTrackOptions(requirementSections).map((section) => {
    const needsMatch = section.content.match(
      /NEEDS:\s*(\d+(?:\.\d+)?)\s*HOURS?/i,
    );

    const courses = parseAuditCourses(section.content);

    return {
      heading: section.heading,
      description: section.content
        .split(/SELECT FROM:/i)[0]
        .split(/NEEDS:/i)[0]
        .trim(),
      hoursNeeded: needsMatch ? Number(needsMatch[1]) : null,
      courses,
      completedCourses: courses.filter(
        (course) => course.status === "Completed",
      ),
      registeredCourses: courses.filter(
        (course) => course.status === "Registered",
      ),
      parentRequirement: section.parentRequirement,
    };
  });
}

/**
 * Extracts eligible course codes from specialty-track options.
 * Expands abbreviated lists such as DASE3009,4435,4470.
 */
export function getTrackEligibleCourses(requirementSections) {
  function parseCourseCodes(courseList) {
    const eligibleCourses = [];

    const tokens =
      courseList.match(/\b[A-Z]{2,5}\s*\d{4}\b|\b\d{4}\b/g) ?? [];

    let previousDepartment = "";

    for (const token of tokens) {
      const match = token.match(/^([A-Z]{2,5})?\s*(\d{4})$/);

      if (!match) continue;

      if (match[1]) {
        previousDepartment = match[1];
      }

      if (previousDepartment) {
        eligibleCourses.push(`${previousDepartment} ${match[2]}`);
      }
    }

    return [...new Set(eligibleCourses)];
  }

  function getCourseList(section) {
    const match = section?.content.match(
      /SELECT FROM:\s*([\s\S]*?)(?=NEEDS:|$)/i,
    );

    return match ? parseCourseCodes(match[1]) : [];
  }

  const options = getSpecialtyTrackOptions(requirementSections);

  const generalTrack = options.find((section) =>
    section.heading.toUpperCase().includes("GENERAL TRACK"),
  );

  const systemsTrack = options.find((section) =>
    section.heading.toUpperCase().includes("SYSTEMS ENGINEERING TRACK"),
  );

  const systemsEngineeringCourses = getCourseList(generalTrack);
  const dataAnalyticsCourses = getCourseList(systemsTrack);

  return options.map((section) => {
    const heading = section.heading.toUpperCase();

    if (heading.includes("GENERAL TRACK")) {
      const categories = [
        {
          name: "Data Analytics",
          requiredCredits: 9,
          eligibleCourses: dataAnalyticsCourses,
        },
        {
          name: "Systems Engineering",
          requiredCredits: 9,
          eligibleCourses: systemsEngineeringCourses,
        },
      ];

      return {
        heading: section.heading,
        requiredCredits: 18,
        categories,
        eligibleCourses: [
          ...new Set(
            categories.flatMap((category) => category.eligibleCourses),
          ),
        ],
      };
    }

    if (heading.includes("DATA ANALYTICS TRACK")) {
      return {
        heading: section.heading,
        requiredCredits: 18,
        eligibleCourses: dataAnalyticsCourses,
      };
    }

    if (heading.includes("SYSTEMS ENGINEERING TRACK")) {
      return {
        heading: section.heading,
        requiredCredits: 18,
        eligibleCourses: systemsEngineeringCourses,
      };
    }

    return {
      heading: section.heading,
      requiredCredits: 18,
      eligibleCourses: [],
    };
  });
}

/**
 * Extracts course choices and equivalent-course groups
 * from the Required Track section of a degree audit.
 */
export function parseRequiredTrackSection(requirementSections) {
  const section = requirementSections.find((item) =>
    /Required Track/i.test(item.heading),
  );

  if (!section) {
    return null;
  }

  const text = section.content;

  const standaloneCourses = [];

  const selectMatches = text.matchAll(
    /SELECT FROM:\s*([A-Z]{2,5})\s*(\d{4})\s*-\s*([^]*?)(?=SELECT FROM:|Term Course Credits Grade Title|$)/gi,
  );

  for (const match of selectMatches) {
    standaloneCourses.push({
      courseCode: `${match[1].toUpperCase()} ${match[2]}`,
      title: match[3].trim(),
    });
  }

  const courseRecords = parseAuditCourses(text);
  const courseGroups = [];

  for (const record of courseRecords) {
    const equivalentMatch = record.title.match(/\+\s*([A-Z]{2,5})\s*(\d{4})/);

    if (equivalentMatch) {
      const primaryCode = record.courseCode.replace(
        /^([A-Z]{2,5})\s*(\d{4})$/,
        "$1 $2",
      );

      const alternateCode = `${equivalentMatch[1].toUpperCase()} ${equivalentMatch[2]}`;

      courseGroups.push({
        courseCodes: [primaryCode, alternateCode],
      });
    }
  }

  for (const record of courseRecords) {
    record.title = record.title.split(/\s+\+\s+(?=DASE\s*\d{4})/i)[0].trim();
  }

  return {
    standaloneCourses,
    courseRecords,
    courseGroups,
  };
}
