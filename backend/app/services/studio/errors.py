from app.core.exceptions import SignBridgeError


class StudioError(SignBridgeError):
    status_code = 422
    code = "studio_invalid"


class StudioConflict(StudioError):
    status_code = 409
    code = "studio_conflict"


class StudioNotFound(StudioError):
    status_code = 404
    code = "studio_not_found"


class StudioForbidden(StudioError):
    status_code = 403
    code = "studio_forbidden"
