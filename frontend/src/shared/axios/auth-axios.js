import Axios from 'axios';
import Qs from 'qs';
import moment from 'moment';
import { AuthToken } from '@/modules/auth/auth-token';
import config from '@/config';
import { getLanguageCode } from '@/i18n';

const authAxios = Axios.create({
  baseURL: config.backendUrl,
  paramsSerializer(params) {
    return Qs.stringify(params, {
      arrayFormat: 'brackets',
      filter: (prefix, value) => {
        if (
          moment.isMoment(value)
          || value instanceof Date
        ) {
          return value.toISOString();
        }

        return value;
      },
    });
  },
});

authAxios.interceptors.request.use(
  async (options) => {
    const token = options.headers?.Authorization || AuthToken.get();

    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }

    options.headers['Accept-Language'] = getLanguageCode();

    return options;
  },
  (error) => {
    console.log('Request error: ', error);
    return Promise.reject(error);
  },
);

export default authAxios;
