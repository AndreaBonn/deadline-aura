'use strict';

const fs = require('fs');
const { google } = require('googleapis');
const { getAuthenticatedClient, TOKEN_PATH } = require('../../integrations/google-calendar');

const SAVED_TOKEN = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expiry_date: 1900000000000,
};

describe('loadSavedToken via getAuthenticatedClient', () => {
  let client;
  const authRequired = new Error('Fake OAuth flow requested');

  beforeEach(() => {
    client = new google.auth.OAuth2();
    vi.spyOn(google.auth, 'OAuth2').mockImplementation(() => client);
    vi.spyOn(client, 'generateAuthUrl').mockImplementation(() => {
      throw authRequired;
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(SAVED_TOKEN));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getAuthenticatedClient_missing_token_requests_oauth', async () => {
    fs.existsSync.mockReturnValue(false);

    const result = getAuthenticatedClient('fake-client-id', 'fake-client-secret');

    await expect(result).rejects.toBe(authRequired);
    expect(client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ access_type: 'offline', prompt: 'consent' }),
    );
  });

  it('getAuthenticatedClient_corrupt_token_requests_oauth', async () => {
    fs.readFileSync.mockReturnValue('{invalid-json');

    const result = getAuthenticatedClient('fake-client-id', 'fake-client-secret');

    await expect(result).rejects.toBe(authRequired);
    expect(client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ access_type: 'offline', prompt: 'consent' }),
    );
  });

  it('getAuthenticatedClient_token_without_credentials_requests_oauth', async () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ token_type: 'Bearer' }));

    const result = getAuthenticatedClient('fake-client-id', 'fake-client-secret');

    await expect(result).rejects.toBe(authRequired);
    expect(client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ access_type: 'offline', prompt: 'consent' }),
    );
  });

  it('getAuthenticatedClient_valid_token_returns_authenticated_client', async () => {
    const result = await getAuthenticatedClient('fake-client-id', 'fake-client-secret');

    expect(result).toBe(client);
    expect(result.credentials).toEqual(SAVED_TOKEN);
    expect(TOKEN_PATH).toContain('deadlineaura/google-token.json');
    expect(fs.readFileSync).toHaveBeenCalledWith(TOKEN_PATH, 'utf-8');
  });
});
