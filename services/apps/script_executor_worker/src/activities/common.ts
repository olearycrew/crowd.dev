import axios from 'axios'

export async function mergeMembers(
  primaryMemberId: string,
  secondaryMemberId: string,
  tenantId: string,
): Promise<void> {
  const url = `${process.env['CROWD_API_SERVICE_URL']}/tenant/${tenantId}/member/${primaryMemberId}/merge`
  console.log(url)

  const requestOptions = {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env['CROWD_API_SERVICE_USER_TOKEN']}`,
      'Content-Type': 'application/json',
    },
    data: {
      memberToMerge: secondaryMemberId,
    },
  }

  console.log('Request Options:', requestOptions)

  try {
    const response = await axios(url, requestOptions)

    console.log('Result: ', response)

    // Axios throws an error for bad status codes, so this check is technically redundant
    if (response.status !== 200) {
      throw new Error(`Failed to merge member ${primaryMemberId} with ${secondaryMemberId}!`)
    }
  } catch (error) {
    console.error('Error during member merge:', error.message)
    throw new Error(
      `Failed to merge member ${primaryMemberId} with ${secondaryMemberId}! Error: ${error.message}`,
    )
  }
}
