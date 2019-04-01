# Guys, Cats and Shoes API
Connect to database through https://safe-cliffs-94582.herokuapp.com/api/
 
## Full List of All Data in Database

```
GET https://safe-cliffs-94582.herokuapp.com/api/
```

Connecting to the api without any additional keywords will retrieve the entirety of the database, giving a list of guys, cats, shoes and their respect ID's.

## Array List of People in Database

```
GET https://safe-cliffs-94582.herokuapp.com/api/people
```

Retrieves a list of all people in the list along with their ID's

## Array List of Cats in Database

```
GET https://safe-cliffs-94582.herokuapp.com/api/cats
```

Retrieves a list of all people in the list along with their ID's

## Full Information on Single Person

```
GET https://safe-cliffs-94582.herokuapp.com/api/:id
```

Gets all the information regarding a single person

## Create Person

```
POST https://safe-cliffs-94582.herokuapp.com/api/create
```

Required fields: 
- name
- age
- cat
- shoe

## Update Person

```
PUT https://safe-cliffs-94582.herokuapp.com/api/:id/update
```

Updates whatever fields were sent in the PUT request

## Delete Person

```
DELETE https://safe-cliffs-94582.herokuapp.com/api/:id/delete
```

Deletes the user whose ID was given