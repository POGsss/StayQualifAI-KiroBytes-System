/**
 * Upskilling_Service facade (Requirements 1.1, 3.1, 5.1).
 *
 * A thin aggregation layer that gives the Upskilling controller a single module
 * to import. It owns no business logic itself; every operation is delegated to
 * one of the three focused sub-services that own the heavy lifting:
 *
 *   - Project_Generator → {@link generateProjects}, {@link saveProject},
 *     {@link listProjects}, {@link deleteProject} (Requirement 1.1)
 *   - Roadmap_Service   → {@link generateRoadmap}, {@link saveRoadmap},
 *     {@link listRoadmaps}, {@link getRoadmap}, {@link setMilestoneCompletion},
 *     {@link deleteRoadmap} (Requirement 3.1)
 *   - Course_Finder     → {@link searchCourses}, {@link saveCourse},
 *     {@link listSavedCourses}, {@link deleteSavedCourse},
 *     {@link getDefaultAdapters}, {@link HttpLearningPlatformAdapter}
 *     (Requirement 5.1)
 *
 * Re-exports are explicit and named (no default export) so the surface stays
 * discoverable and tree-shake friendly. `.js` import specifiers match the
 * ESM/NodeNext module resolution used throughout the backend.
 */

// Project_Generator sub-service (Requirement 1.1).
export {
  generateProjects,
  saveProject,
  listProjects,
  deleteProject,
} from './upskilling.projectGenerator.service.js';
export type { ISaveProjectInput } from './upskilling.projectGenerator.service.js';

// Roadmap_Service sub-service (Requirement 3.1).
export {
  generateRoadmap,
  saveRoadmap,
  listRoadmaps,
  getRoadmap,
  setMilestoneCompletion,
  deleteRoadmap,
} from './upskilling.roadmap.service.js';

// Course_Finder sub-service (Requirement 5.1).
export {
  searchCourses,
  saveCourse,
  listSavedCourses,
  deleteSavedCourse,
  getDefaultAdapters,
  HttpLearningPlatformAdapter,
} from './upskilling.courseFinder.service.js';
export type { ISaveCourseInput } from './upskilling.courseFinder.service.js';
