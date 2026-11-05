/**
 * Extracts course-history records from the text of a UCCS DASE degree audit.
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
 * This is an initial extraction step, not the final requirement evaluator.
 */
export function extractRequirementPages(pages) {
  return pages.slice(4, 10).map((text, index) => ({
    pageNumber: index + 5,
    text: text.replace(/\s+/g, " ").trim(),
  }));
}

/**
 * Identifies requirement markers in the extracted degree-audit text.
 * Captures only the short text immediately following each NEEDS marker.
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
 * Finds recognizable requirement headings in the audit text.
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
    /Data Analytics & Systems Engineering\s*-\s*([^]+?)\s+(NO|IP|OK)\b/g;

  return pages.flatMap((text, index) => {
    const isWorkNotAppliedPage = /WORK NOT APPLIED TO THIS PROGRAM/i.test(text);

    return [...text.matchAll(statusPattern)].map((match) => ({
      pageNumber: index + 1,
      requirement: match[1].trim(),
      status: match[2],
      isWorkNotAppliedPage,
    }));
  });
}

/**
 * Groups explicit audit statuses into a simple summary.
 * This does not yet determine missing courses or credits.
 */

/**
 * Groups degree requirements by their explicit audit status.
 * Program Information is retained separately because it is
 * not a course requirement.
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
 * Extracts the page-level summary and Required Core section
 * from page 7 of the degree audit.
 */
export function extractRequiredCoreText(requirementPages) {
  const requiredCorePage = requirementPages.find(
    (page) => page.pageNumber === 7,
  );

  if (!requiredCorePage) {
    return null;
  }

  const text = requiredCorePage.text;

  const summaryMatch = text.match(
    /IN PROGRESS\s+([\d.]+)\s+HOURS\s+NEEDS:\s*([\d.]+)\s+HOURS\s+EARNED:\s*([\d.]+)\s+HOURS/i,
  );

  const coreStart = text.search(
    /Data Analytics & Systems Engineering\s*-\s*Required Core\s+NO\b/i,
  );

  const writingStart = text.search(/\+\s*WRITING INTENSIVE COURSE\b/i);

  return {
    pageNumber: 7,
    summary: summaryMatch
      ? {
          inProgressHours: Number(summaryMatch[1]),
          needsHours: Number(summaryMatch[2]),
          earnedHours: Number(summaryMatch[3]),
        }
      : null,
    coreSection:
      coreStart !== -1 && writingStart > coreStart
        ? text.slice(coreStart, writingStart).trim()
        : null,
  };
}

/**
 * Extracts the course record explicitly shown under Required Core.
 * This does not decide which courses are still needed.
 */
export function parseRequiredCoreCourse(coreSection) {
  if (!coreSection) {
    return [];
  }

  const coursePattern =
    /\b([A-Z]{2,5}\s?\d{4})\s+(\d+(?:\.\d+)?)\s+([A-F][+-]?|\*{3})\s+(.+?)(?=$)/i;

  const match = coreSection.match(coursePattern);

  if (!match) {
    return [];
  }

  return [
    {
      courseCode: match[1].trim(),
      credits: Number(match[2]),
      grade: match[3],
      title: match[4].trim(),
    },
  ];
}

/**
 * Splits degree-audit pages into requirement sections.
 * Marks specialty tracks as alternatives rather than separate requirements.
 */
export function extractRequirementSections(requirementPages) {
  const headingPattern =
    /\+\s*GATEWAY PROGRAM SEMINAR|\+\s*SUSTAINABILITY|\+\s*INCLUSIVENESS|-\s*SUMMIT|\+\s*NAVIGATE|\+\s*EXPLORE\s*-\s*[^+]+?(?=\s+Complete\b)|Data Analytics & Systems Engineering\s*-\s*[^+]{1,80}?\s+(?:NO|IP|OK)\b|\+\s*UPPER-DIVISION WRITING INTENSIVE COURSE\b|\+\s*WRITING INTENSIVE COURSE\b|\bREQUIRED SPECIALTY TRACK\b|\bGENERAL TRACK\b|\bSYSTEMS ENGINEERING TRACK\b|\bDATA ANALYTICS TRACK\b|\bTECHNICAL ELECTIVES\b|\bDASE\s*-\s*REQUIRED MATHEMATICS\b/g;
  const alternativeTracks = new Set([
    "GENERAL TRACK",
    "SYSTEMS ENGINEERING TRACK",
    "DATA ANALYTICS TRACK",
  ]);

  return requirementPages.flatMap(({ pageNumber, text }) => {
    const headings = [...text.matchAll(headingPattern)];

    return headings.map((match, index) => {
      const heading = match[0].trim();
      const normalizedHeading = heading.replace(/^\+\s*/, "").toUpperCase();

      const start = match.index;
      const nextHeading = headings[index + 1];
      const end = nextHeading ? nextHeading.index : text.length;

      const isAlternativeTrack = alternativeTracks.has(normalizedHeading);

      return {
        pageNumber,
        heading,
        content: text.slice(start + match[0].length, end).trim(),
        sectionType: isAlternativeTrack ? "alternative-track" : "requirement",
        parentRequirement: isAlternativeTrack
          ? "REQUIRED SPECIALTY TRACK"
          : null,
      };
    });
  });
}

/**
 * Groups specialty-track options under their shared requirement.
 * The student needs to complete one track, not all three.
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
 * specialty-track option. The options remain separate alternatives.
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
 * Extracts eligible course codes from a specialty-track section.
 * These are course options, not necessarily courses the student
 * has completed or registered for.
 */

/**
 * Extracts eligible course codes from specialty-track options.
 * Expands abbreviated lists such as DASE3009,4435,4470.
 */
export function getTrackEligibleCourses(requirementSections) {
  return getSpecialtyTrackOptions(requirementSections).map((section) => {
    const selectMatch = section.content.match(
      /SELECT FROM:\s*([\s\S]*?)(?=NEEDS:|$)/i,
    );

    const eligibleCourses = [];

    if (selectMatch) {
      const courseList = selectMatch[1];
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
    }

    const needsMatch = section.content.match(
      /NEEDS:\s*(\d+(?:\.\d+)?)\s*HOURS?/i,
    );

    return {
      heading: section.heading,
      eligibleCourses: [...new Set(eligibleCourses)],
      hoursNeeded: needsMatch ? Number(needsMatch[1]) : null,
    };
  });
}

/**
 * Extracts course choices and equivalent-course groups
 * from the Required Track section of a UCCS degree audit.
 */
export function parseRequiredTrackSection(requirementSections) {
  const section = requirementSections.find(
    (item) => item.heading.includes("Required Track") && item.pageNumber === 8,
  );

  if (!section) {
    return null;
  }

  const text = section.content;

  // Extract standalone course choices.
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

  // Extract course records shown in the audit.
  const courseRecords = parseAuditCourses(text);

  // Extract course equivalency groups before cleaning titles.
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

  // Remove equivalency information from the course titles.
  for (const record of courseRecords) {
    record.title = record.title.split(/\s+\+\s+(?=DASE\s*\d{4})/i)[0].trim();
  }

  return {
    standaloneCourses,
    courseRecords,
    courseGroups,
  };
}
