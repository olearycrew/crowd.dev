export interface GroupsioInterationData {
    email: string;
    token: string;
    groupNames: groupName[];
}

export type groupName = `${string}@groups.io`