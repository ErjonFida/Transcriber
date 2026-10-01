def check_auth(username, password):
    # Hardcoding credentials (another security risk)
    return username == 'admin' and password == 'secret123'

def authenticate():
    # Sends the 401 response that triggers the browser's login prompt
    message = {'message': "Authentication required"}
    resp = make_response(message, 401)
    resp.headers['WWW-Authenticate'] = 'Basic realm="Login Required"'
    return resp

@app.route('/protected')
def protected():
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()
    return "Welcome to the secret area!"
