# Shared Degree Audit JSON Format

## 1. Purpose

This document defines the shared JSON format used by the Audit Solver Tool to import and process college degree audits.

The goal is to allow multiple sources to provide degree audit information in the same format.

Currently supported or planned sources include:

- `pdf`: Information extracted from a college degree audit PDF.
- `bookmarklet`: Information extracted by a browser bookmarklet.
- `json`: An existing shared JSON file.

All imported data must follow this format before it is passed to the planner.

The application uses a shared `parseAudit()` function to validate and normalize imported data.

## 2. Top-Level Structure

Every shared audit JSON object must contain these seven properties:

| Property        | Type   | Description                                       |
| --------------- | ------ | ------------------------------------------------- |
| `schemaVersion` | Number | Version of the shared JSON format. Currently `1`. |
| `source`        | String | Where the audit data originated.                  |
| `student`       | Object | Student information.                              |
| `credits`       | Object | Overall degree credit information.                |
| `courses`       | Array  | Courses still needed or available to schedule.    |
| `requirements`  | Array  | Degree requirements and their progress.           |
| `courseCatalog` | Array  | Course availability and prerequisite information. |

Example:

```json
{
  "schemaVersion": 1,
  "source": "pdf",
  "student": {},
  "credits": {},
  "courses": [],
  "requirements": [],
  "courseCatalog": []
}
```

## 3. Student

The `student` object contains basic information about the student.

| Property | Type             | Required | Description                |
| -------- | ---------------- | -------- | -------------------------- |
| `name`   | String           | Yes      | Student's name.            |
| `majors` | Array of strings | Yes      | Student's major or majors. |
| `minors` | Array of strings | Yes      | Student's minor or minors. |

Rules:

- `name` must be a non-empty string.
- `majors` and `minors` must be arrays.
- The arrays may be empty if the student does not have a major or minor listed.

Example:

```json
{
  "name": "Example Student",
  "majors": ["Data Analytics & Systems Engineering"],
  "minors": []
}
```

## 4. Credits

The `credits` object tracks overall degree progress.

| Property   | Type           | Required | Description                            |
| ---------- | -------------- | -------- | -------------------------------------- |
| `earned`   | Number         | Yes      | Credits successfully completed.        |
| `required` | Number or null | Yes      | Total credits required for graduation. |

Rules:

- `earned` must be a nonnegative number.
- `required` must be a positive number or `null` when the total requirement is unknown.
- Earned credits should include completed credits only.
- Registered, failed, and planned courses must not count as earned credits.
- When `required` is known, `earned` must not exceed `required`.

Remaining credits can be calculated as:

`required - earned`

If `required` is unknown, the application must not calculate an overall remaining-credit total.

Example:

```json
{
  "earned": 87,
  "required": null
}
```

## 5. Courses

The `courses` array contains courses that the student still needs or may be eligible to schedule.

Completed courses do not need to be individually included in this array. Their progress is represented through the requirement progress information.

Each course must contain:

| Property         | Type             | Description                                     |
| ---------------- | ---------------- | ----------------------------------------------- |
| `id`             | String           | Unique course identifier.                       |
| `code`           | String           | Course code, such as `CS 3020`.                 |
| `title`          | String           | Course title.                                   |
| `credits`        | Number           | Number of credits the course is worth.          |
| `requirementIds` | Array of strings | IDs of requirements associated with the course. |

Rules:

- Every course must have a unique, non-empty `id`.
- `code` and `title` must be non-empty strings.
- `credits` must be a positive number.
- `requirementIds` must be an array.
- Every requirement ID must reference an existing requirement.
- A course may satisfy more than one requirement.

Example:

```json
{
  "id": "CS3020",
  "code": "CS 3020",
  "title": "Advanced Object-Oriented Programming",
  "credits": 3,
  "requirementIds": ["technical-electives"]
}
```

### 5.1 Course Equivalency Groups

Some degree audits allow one required course to be satisfied by completing one of several equivalent courses.

For example:

- DASE 2080 OR CS 2080
- DASE 3050 OR CS 3050
- DASE 3080 OR CS 3080

Requirements may contain an optional `courseGroups` array.

Each group contains:

| Property    | Type             | Description                                                            |
| ----------- | ---------------- | ---------------------------------------------------------------------- |
| `courseIds` | Array of strings | Courses that are equivalent alternatives for one required course slot. |

Rules:

- Each group must contain at least one course ID.
- Every course ID must reference an existing course in the top-level `courses` array.
- The student only needs to complete one course from each group.
- Multiple courses in the same group are alternatives, not separate requirements.
- A requirement may contain multiple course groups.

Example:

```json
"courseGroups": [
  {
    "courseIds": ["CS2080", "DASE2080"]
  },
  {
    "courseIds": ["CS3050", "DASE3050"]
  }
]
```

## 6. Requirements

The `requirements` array contains the degree requirements that the student must satisfy.

Each requirement must contain:

| Property            | Type             | Description                                              |
| ------------------- | ---------------- | -------------------------------------------------------- |
| `id`                | String           | Unique requirement identifier.                           |
| `name`              | String           | Requirement name.                                        |
| `selection`         | Object           | Defines how courses or subgroups must be selected.       |
| `requiredCredits`   | Number           | Credits required for this requirement.                   |
| `earnedCredits`     | Number           | Credits already earned toward this requirement.          |
| `remainingCredits`  | Number           | Credits still needed for this requirement.               |
| `courseIds`         | Array of strings | Mandatory courses.                                       |
| `eligibleCourseIds` | Array of strings | Courses that may be selected to satisfy the requirement. |

Rules:

- Every requirement must have a unique, non-empty ID.
- `name` must be a non-empty string.
- Credit values must be nonnegative numbers.
- `courseIds` and `eligibleCourseIds` must be arrays.
- All referenced course IDs must exist in the top-level `courses` array.
- `earnedCredits` and `remainingCredits` should reflect the actual degree audit progress.
- The parser should not assume that every listed eligible course is required.
- A requirement may contain optional `courseGroups` or `subgroups` as described below.

### 6.1 Selection Types

The `selection` object determines how the student must satisfy a requirement.

Three selection types are supported.

**Type 1: `all`**

The student must complete every course listed in `courseIds`.

Example:

```json
"selection": {
  "type": "all"
}
```

**Type 2: `credits`**

The student must earn a specified number of credits from the courses listed in `eligibleCourseIds`.

Example:

```json
"selection": {
  "type": "credits",
  "creditsRequired": 9
}
```

**Type 3: `choose`**

The student must select a specified number of courses from `eligibleCourseIds`.

Example:

```json
"selection": {
  "type": "choose",
  "coursesRequired": 2
}
```

### 6.2 Subgroups

Some degree requirements contain multiple alternative groups of requirements. The student must complete a specified number of those groups.

For example, a specialty-track requirement may allow the student to choose one of the following:

- Data Analytics Track
- Systems Engineering Track
- General Track

Requirements may contain an optional `subgroups` array.

The parent requirement's `selection` object specifies how many subgroups must be completed.

Example:

```json
"selection": {
  "type": "choose",
  "subgroupsRequired": 1
}
```

Each subgroup contains:

| Property            | Type             | Description                           |
| ------------------- | ---------------- | ------------------------------------- |
| `id`                | String           | Unique subgroup identifier.           |
| `name`              | String           | Subgroup name.                        |
| `requiredCredits`   | Number           | Credits required within the subgroup. |
| `earnedCredits`     | Number           | Credits earned toward the subgroup.   |
| `remainingCredits`  | Number           | Credits remaining in the subgroup.    |
| `eligibleCourseIds` | Array of strings | Courses eligible for the subgroup.    |

A subgroup may also contain the following optional properties:

- `courseGroups`: Groups of equivalent courses within the subgroup.
- `categories`: Separate credit requirements that must each be completed within the subgroup.

#### Categories

A subgroup may contain a `categories` array when it has multiple separate credit requirements.

Each category contains:

| Property            | Type             | Description                                     |
| ------------------- | ---------------- | ----------------------------------------------- |
| `id`                | String           | Unique category identifier within its subgroup. |
| `name`              | String           | Category name.                                  |
| `requiredCredits`   | Number           | Credits required in the category.               |
| `earnedCredits`     | Number           | Credits earned toward the category.             |
| `remainingCredits`  | Number           | Credits remaining in the category.              |
| `eligibleCourseIds` | Array of strings | Courses eligible for the category.              |

All categories within a subgroup must be completed. Their credit requirements are separate and must not be treated as alternatives or equivalent-course groups.

For example, the General Track requires:

- 9 credits from Data Analytics courses.
- 9 credits from Systems Engineering courses.

Both categories must be completed to satisfy the 18-credit General Track requirement.

#### Rules

- Every subgroup must have a unique, non-empty ID within its parent requirement.
- Each subgroup must have a non-empty name.
- Credit values must be nonnegative numbers.
- All course IDs must reference existing courses in the top-level `courses` array.
- The parent selection determines how many subgroups the student must complete.
- Subgroups are alternatives when the parent uses `choose`.
- A subgroup may contain additional course-selection rules.
- Every category within a subgroup must be completed.
- Each category must have a unique, non-empty ID within its subgroup.
- Each category must have a non-empty name.
- Category credit values must be nonnegative numbers.
- Category course IDs must reference existing courses in the top-level `courses` array.

#### Example

```json
{
  "id": "required-track",
  "name": "Required Track",
  "selection": {
    "type": "choose",
    "subgroupsRequired": 1
  },
  "requiredCredits": 18,
  "earnedCredits": 0,
  "remainingCredits": 18,
  "courseIds": [],
  "eligibleCourseIds": [],
  "subgroups": [
    {
      "id": "data-analytics-track",
      "name": "Data Analytics Track",
      "requiredCredits": 18,
      "earnedCredits": 0,
      "remainingCredits": 18,
      "eligibleCourseIds": []
    },
    {
      "id": "systems-engineering-track",
      "name": "Systems Engineering Track",
      "requiredCredits": 18,
      "earnedCredits": 0,
      "remainingCredits": 18,
      "eligibleCourseIds": []
    },
    {
      "id": "general-track",
      "name": "General Track",
      "requiredCredits": 18,
      "earnedCredits": 0,
      "remainingCredits": 18,
      "eligibleCourseIds": [],
      "categories": [
        {
          "id": "general-data-analytics",
          "name": "Data Analytics Courses",
          "requiredCredits": 9,
          "earnedCredits": 0,
          "remainingCredits": 9,
          "eligibleCourseIds": []
        },
        {
          "id": "general-systems-engineering",
          "name": "Systems Engineering Courses",
          "requiredCredits": 9,
          "earnedCredits": 0,
          "remainingCredits": 9,
          "eligibleCourseIds": []
        }
      ]
    }
  ]
}
```

The General Track contains two separate categories. The student must earn 9 credits in each category to satisfy the 18-credit requirement.

Course IDs will be populated from the audit's eligible-course lists.

## 7. Course Catalog

The `courseCatalog` array contains additional information about courses, including availability and prerequisites.

Each catalog entry must contain:

| Property            | Type                     | Description                                |
| ------------------- | ------------------------ | ------------------------------------------ |
| `courseId`          | String                   | ID of the associated course.               |
| `availableTerms`    | Array of strings         | Terms in which the course is offered.      |
| `availabilityKnown` | Boolean                  | Whether availability information is known. |
| `prerequisites`     | Array of strings or null | Required prerequisite course codes.        |
| `corequisites`      | Array of strings or null | Required concurrent course codes.          |

Rules:

- `courseId` must reference an existing course in `courses`.
- `availableTerms` must be an array of strings.
- `availabilityKnown` must be a Boolean.
- `prerequisites` and `corequisites` may be arrays of strings or `null`.
- An empty array means the course is known to have no prerequisites or corequisites.
- `null` means the information is unknown or unavailable.
- Prerequisites and corequisites may reference courses that are not in the remaining-course list because the student may have already completed them.
- A course being offered in a particular term does not guarantee that a seat is available.

Example:

```json
{
  "courseId": "CS3020",
  "availableTerms": ["Fall"],
  "availabilityKnown": true,
  "prerequisites": ["CS2080"],
  "corequisites": []
}
```

## 8. Validation Rules

The shared `parseAudit()` function must validate imported JSON before it is used by the planner.

Validation should include:

1. The root value must be an object.
2. `schemaVersion` must equal `1`.
3. `source` must be one of the supported source values:
   - `pdf`
   - `bookmarklet`
   - `json`
4. The `student` object must contain valid student information.
5. The `credits` object must contain valid credit values.
6. `courses` must be an array of valid course objects.
7. Course IDs must be unique.
8. `requirements` must be an array of valid requirement objects.
9. Requirement IDs must be unique.
10. All course references must point to valid courses where required.
11. Selection types must be supported.
12. Course equivalency groups must contain valid course references.
13. Subgroups must contain valid information and course references.
14. `courseCatalog` must be an array of valid catalog objects.

The parser should reject invalid data with a useful error message explaining what needs to be corrected.

## 9. Normalization

After validation, `parseAudit()` should normalize the data into a consistent structure.

Normalization may include:

- Trimming unnecessary whitespace from strings.
- Standardizing course-code formatting.
- Ensuring optional arrays have consistent defaults.
- Ensuring optional subgroup and course-group properties are handled consistently.
- Returning a predictable object structure for the planner.

The parser should not invent missing information or assume that unknown values are known.

## 10. Data Flow

All import sources should follow the same general process:

1. The user selects an import source.
2. The importer extracts or reads the source data.
3. The source-specific importer converts the information into the shared JSON format.
4. The shared `parseAudit()` function validates and normalizes the JSON.
5. The validated audit data is passed to the planner and application state.

The PDF importer, bookmarklet, and JSON importer should all produce the same shared format.

The planner and application state should not need to know which source originally provided the data.

## 11. Important Design Decisions

- The shared JSON format uses `schemaVersion: 1`.
- The initial implementation supports UCCS degree audits.
- Completed courses are represented through requirement progress rather than requiring a full course-history import.
- Registered courses must not count as earned credits.
- Course equivalencies are represented using `courseGroups`.
- Alternative degree pathways are represented using `subgroups`.
- A subgroup may contain its own course groups.
- Unknown information must remain unknown rather than being guessed.
- Course availability does not guarantee that a course is open for registration.

## 12. Current Implementation Status

The shared format and parser are being developed incrementally.

| Component                      | Status                                   |
| ------------------------------ | ---------------------------------------- |
| PDF text extraction            | Implemented                              |
| Student information extraction | Partially implemented                    |
| Overall credit extraction      | Partially implemented                    |
| Requirement status extraction  | Implemented                              |
| Required Core extraction       | Partially implemented                    |
| Required Track extraction      | Partially implemented                    |
| Specialty-track extraction     | Partially implemented                    |
| Course equivalency extraction  | Implemented for identified cases         |
| Shared JSON scaffold           | Implemented                              |
| Shared JSON validation         | Implemented, with further updates needed |
| Full normalization             | Not yet implemented                      |
| Bookmarklet integration        | Not yet implemented                      |
| JSON import integration        | Not yet implemented                      |

This document describes the intended shared JSON contract. The implementation status may change as development continues.
