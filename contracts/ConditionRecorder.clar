(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PRODUCT-ID u101)
(define-constant ERR-INVALID-CONDITION-HASH u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-PRODUCT-NOT-FOUND u104)
(define-constant ERR-ORACLE-NOT-VERIFIED u105)
(define-constant ERR-ALREADY-RECORDED u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-INVALID-LOCATION u108)
(define-constant ERR-INVALID-SENSOR-DATA u109)
(define-constant ERR-MAX-RECORDS-EXCEEDED u110)
(define-constant ERR-INVALID-UPDATE-PARAM u111)
(define-constant ERR-AUTHORITY-NOT-SET u112)
(define-constant ERR-INVALID-ROLE u113)
(define-constant ERR-RECORD-NOT-FOUND u114)
(define-constant ERR-INVALID-HASH-LENGTH u115)
(define-constant ERR-INVALID-ORACLE u116)
(define-constant ERR-TIMESTAMP-IN-FUTURE u117)
(define-constant ERR-TIMESTAMP-TOO_OLD u118)
(define-constant ERR-INVALID-METADATA u119)
(define-constant ERR-MAX-METADATA-LENGTH u120)

(define-data-var next-record-id uint u0)
(define-data-var max-records-per-product uint u50)
(define-data-var recording-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var oracle-principal (optional principal) none)

(define-map product-conditions
  uint
  (list 50
    {
      record-id: uint,
      condition-hash: (buff 32),
      timestamp: uint,
      status: (string-utf8 20),
      location: (string-utf8 100),
      sensor-data: (buff 128),
      recorder: principal,
      verified: bool
    }
  )
)

(define-map condition-metadata
  uint
  {
    description: (string-utf8 256),
    additional-hash: (buff 32)
  }
)

(define-map authorized-roles
  principal
  (string-utf8 20)
)

(define-read-only (get-condition-history (product-id uint))
  (map-get? product-conditions product-id)
)

(define-read-only (get-condition-metadata (record-id uint))
  (map-get? condition-metadata record-id)
)

(define-read-only (has-role (user principal) (role (string-utf8 20)))
  (is-eq (map-get? authorized-roles user) (some role))
)

(define-private (validate-product-id (id uint))
  (if (> id u0)
    (ok true)
    (err ERR-INVALID-PRODUCT-ID)
  )
)

(define-private (validate-condition-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    (err ERR-INVALID-HASH-LENGTH)
  )
)

(define-private (validate-timestamp (ts uint))
  (let ((current-height block-height))
    (if (and (>= ts (- current-height u100)) (<= ts (+ current-height u10)))
      (ok true)
      (if (> ts (+ current-height u10))
        (err ERR-TIMESTAMP-IN-FUTURE)
        (err ERR-TIMESTAMP-TOO_OLD)
      )
    )
  )
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status "pre-shipment") (is-eq status "post-shipment") (is-eq status "in-transit"))
    (ok true)
    (err ERR-INVALID-STATUS)
  )
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
    (ok true)
    (err ERR-INVALID-LOCATION)
  )
)

(define-private (validate-sensor-data (data (buff 128)))
  (if (<= (len data) u128)
    (ok true)
    (err ERR-INVALID-SENSOR-DATA)
  )
)

(define-private (validate-metadata (desc (string-utf8 256)))
  (if (<= (len desc) u256)
    (ok true)
    (err ERR-MAX-METADATA-LENGTH)
  )
)

(define-private (is-authorized (user principal))
  (or (has-role user "shipper") (has-role user "admin"))
)

(define-private (is-oracle (user principal))
  (is-eq (some user) (var-get oracle-principal))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-oracle-principal (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-principal (some oracle))
    (ok true)
  )
)

(define-public (grant-role (user principal) (role (string-utf8 20)))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (asserts! (or (is-eq role "shipper") (is-eq role "admin") (is-eq role "oracle")) (err ERR-INVALID-ROLE))
    (map-set authorized-roles user role)
    (ok true)
  )
)

(define-public (revoke-role (user principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (map-delete authorized-roles user)
    (ok true)
  )
)

(define-public (set-max-records-per-product (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-records-per-product new-max)
    (ok true)
  )
)

(define-public (set-recording-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set recording-fee new-fee)
    (ok true)
  )
)

(define-public (record-condition
  (product-id uint)
  (condition-hash (buff 32))
  (timestamp uint)
  (status (string-utf8 20))
  (location (string-utf8 100))
  (sensor-data (buff 128))
  (metadata-desc (string-utf8 256))
  (additional-hash (buff 32))
)
  (let (
    (current-history (default-to (list) (map-get? product-conditions product-id)))
    (record-id (var-get next-record-id))
    (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET)))
    (max-records (var-get max-records-per-product))
  )
    (asserts! (is-authorized tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-product-id product-id))
    (try! (validate-condition-hash condition-hash))
    (try! (validate-timestamp timestamp))
    (try! (validate-status status))
    (try! (validate-location location))
    (try! (validate-sensor-data sensor-data))
    (try! (validate-metadata metadata-desc))
    (try! (validate-condition-hash additional-hash))
    (asserts! (< (len current-history) max-records) (err ERR-MAX-RECORDS-EXCEEDED))
    (asserts! (is-none (fold check-duplicate current-history none)) (err ERR-ALREADY-RECORDED))
    (try! (stx-transfer? (var-get recording-fee) tx-sender authority))
    (let (
      (new-record
        {
          record-id: record-id,
          condition-hash: condition-hash,
          timestamp: timestamp,
          status: status,
          location: location,
          sensor-data: sensor-data,
          recorder: tx-sender,
          verified: false
        }
      )
    )
      (map-set product-conditions product-id (append current-history new-record))
      (map-set condition-metadata record-id
        {
          description: metadata-desc,
          additional-hash: additional-hash
        }
      )
      (var-set next-record-id (+ record-id u1))
      (print { event: "condition-recorded", product-id: product-id, record-id: record-id })
      (ok record-id)
    )
  )
)

(define-private (check-duplicate (record {record-id: uint, condition-hash: (buff 32), timestamp: uint, status: (string-utf8 20), location: (string-utf8 100), sensor-data: (buff 128), recorder: principal, verified: bool}) (acc (optional uint)))
  (match acc
    some-id some-id
    (if (is-eq (get condition-hash record) condition-hash)
      (some (get record-id record))
      none
    )
  )
)

(define-public (verify-condition (product-id uint) (record-id uint))
  (let (
    (history (unwrap! (map-get? product-conditions product-id) (err ERR-PRODUCT-NOT-FOUND)))
    (metadata (unwrap! (map-get? condition-metadata record-id) (err ERR-RECORD-NOT-FOUND)))
  )
    (asserts! (is-oracle tx-sender) (err ERR-ORACLE-NOT-VERIFIED))
    (let (
      (updated-history
        (map update-verified history record-id)
      )
    )
      (map-set product-conditions product-id updated-history)
      (print { event: "condition-verified", product-id: product-id, record-id: record-id })
      (ok true)
    )
  )
)

(define-private (update-verified (record {record-id: uint, condition-hash: (buff 32), timestamp: uint, status: (string-utf8 20), location: (string-utf8 100), sensor-data: (buff 128), recorder: principal, verified: bool}) (target-id uint))
  (if (is-eq (get record-id record) target-id)
    (merge record { verified: true })
    record
  )
)

(define-public (get-record-count (product-id uint))
  (ok (len (default-to (list) (map-get? product-conditions product-id))))
)

(define-public (is-condition-verified (product-id uint) (record-id uint))
  (let (
    (history (unwrap! (map-get? product-conditions product-id) (err ERR-PRODUCT-NOT-FOUND)))
  )
    (fold find-verified history record-id)
  )
)

(define-private (find-verified (record {record-id: uint, condition-hash: (buff 32), timestamp: uint, status: (string-utf8 20), location: (string-utf8 100), sensor-data: (buff 128), recorder: principal, verified: bool}) (acc (tuple (found bool) (verified bool) (target uint))))
  (if (get found acc)
    acc
    (if (is-eq (get record-id record) (get target acc))
      { found: true, verified: (get verified record), target: (get target acc) }
      { found: false, verified: false, target: (get target acc) }
    )
  )
)